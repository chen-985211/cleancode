// @vitest-environment node

import { execFile } from 'node:child_process'
import { access, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, delimiter, dirname, join } from 'node:path'
import { promisify } from 'node:util'

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  installFakeCodexCli,
  readFakeCodexCliReports,
  type FakeCodexCliFixture,
  type FakeCodexCliReport
} from '../fixtures/contexts/agent/fakeCodexCli'
import {
  createE2eWorkbench,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { ensureTerminalDomRenderer } from '../support/terminalSelectionE2e'

const execFileAsync = promisify(execFile)
const featureBranchName = 'feature/agent-theme'
const fakeCodexMarker = 'CC_E2E_CODEX_READY'
const gitLocalEnvironmentVariables = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR'
] as const

describe('Agent terminal theme across workspaces e2e', () => {
  let electronApp: ElectronApplication
  let fakeCodex: FakeCodexCliFixture
  let page: Page
  let resources: E2eScenarioResources
  let workbench: E2eWorkbench

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-agent-theme-e2e')
    resources.workbench = workbench
    await initializeGitProject(workbench.projectDirectory)
    fakeCodex = await installFakeCodexCli(workbench.appStateDirectory)
    electronApp = await launchApp(workbench, {
      environment: {
        CLEANCODE_FAKE_CODEX_REPORT_PATH: fakeCodex.reportPath,
        CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '0',
        PATH: [fakeCodex.binDirectory, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter),
        SHELL: '/bin/sh'
      }
    })
    resources.electronApp = electronApp
    page = await electronApp.firstWindow()
    resources.page = page
    await page.waitForLoadState('domcontentloaded')
  }, electronScenarioTimeoutMs)

  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      cleanupWorkbenchArtifacts: async (currentWorkbench) => {
        await rm(projectWorktreesDirectory(currentWorkbench.projectDirectory), {
          recursive: true,
          force: true
        })
      },
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  }, electronScenarioTimeoutMs)

  it(
    'reuses each workspace Agent process while adapting its fixed source theme to the app theme',
    async () => {
      await expectDesktopRuntime(page)
      await selectTheme(page, 'light')
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForPersistedAgent(page)

      const projectCard = page.getByRole('group', {
        name: `项目 ${basename(workbench.projectDirectory)}`
      })
      const mainSession = await waitForAgentTerminal(page, 'main', 'light')

      await expectFakeCodexSession(mainSession, workbench.projectDirectory, fakeCodex.reportPath)
      await expectTerminalPresentation(page, mainSession.viewport, 'light', false)

      await selectTheme(page, 'dark')
      await expectTerminalPresentation(page, mainSession.viewport, 'dark', true)

      await projectCard.getByRole('button', { name: '新建分支工作区' }).click()
      await projectCard.getByLabel('分支名称').fill(featureBranchName)
      await projectCard.getByRole('button', { name: '创建 Worktree' }).click()

      const featureWorkspaceButton = projectCard.getByRole('button', {
        name: /feature\/agent-theme.*独立工作区/
      })
      const featureWorktreeDirectory = branchWorktreeDirectory(
        workbench.projectDirectory,
        featureBranchName
      )

      await featureWorkspaceButton.waitFor()
      await access(join(featureWorktreeDirectory, '.git'))
      const canonicalFeatureDirectory = await realpath(featureWorktreeDirectory)
      await expectCurrentGitBranch(featureWorktreeDirectory, featureBranchName)

      const featureSession = await waitForAgentTerminal(page, featureBranchName, 'dark')

      await expectFakeCodexSession(featureSession, canonicalFeatureDirectory, fakeCodex.reportPath)
      await expectTerminalPresentation(page, featureSession.viewport, 'dark', false)

      await projectCard.locator('.default-branch-selector__select').click()
      const restoredMainSession = await waitForAgentTerminal(page, 'main', 'light')

      expect(restoredMainSession.sessionId).toBe(mainSession.sessionId)
      expect(restoredMainSession.terminalProcessId).toBe(mainSession.terminalProcessId)
      expect(restoredMainSession.providerProcessId).toBe(mainSession.providerProcessId)
      await expectTerminalPresentation(page, restoredMainSession.viewport, 'dark', true)

      await selectTheme(page, 'light')
      await featureWorkspaceButton.click()
      const restoredFeatureSession = await waitForAgentTerminal(page, featureBranchName, 'dark')

      expect(restoredFeatureSession.sessionId).toBe(featureSession.sessionId)
      expect(restoredFeatureSession.terminalProcessId).toBe(featureSession.terminalProcessId)
      expect(restoredFeatureSession.providerProcessId).toBe(featureSession.providerProcessId)
      await expectTerminalPresentation(page, restoredFeatureSession.viewport, 'light', true)

      const reports = await readFakeCodexCliReports(fakeCodex.reportPath)
      expectSessionReport(reports, mainSession, workbench.projectDirectory, 'light')
      expectSessionReport(reports, featureSession, canonicalFeatureDirectory, 'dark')
      const sessionReports = reports.filter((report) => report.kind === 'session')
      expect(sessionReports).toHaveLength(2)
      expect(new Set(sessionReports.map((report) => String(report.pid)))).toEqual(
        new Set([mainSession.providerProcessId, featureSession.providerProcessId])
      )
      expect(new Set(sessionReports.map((report) => report.cwd))).toEqual(
        new Set([workbench.projectDirectory, canonicalFeatureDirectory])
      )
    },
    electronScenarioTimeoutMs
  )

  it(
    'keeps terminal reading insets on the same visual plane after a theme switch',
    async () => {
      await expectDesktopRuntime(page)
      await selectTheme(page, 'light')
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForPersistedAgent(page)
      await page.getByRole('button', { name: '新建终端积木' }).click()

      const terminalProjection = page.locator(
        '[data-terminal-block-id] .terminal-theme-projection[data-terminal-source-theme="light"]'
      )
      const agentProjection = page.locator(
        '[data-agent-console-node] .terminal-theme-projection[data-terminal-source-theme="light"]'
      )
      await terminalProjection.locator('.terminal-viewport .xterm-helper-textarea').waitFor()
      await agentProjection.locator('.agent-terminal-viewport .xterm-helper-textarea').waitFor()

      await selectTheme(page, 'dark')
      await expectProjectionColorContinuity(page, terminalProjection, 'terminal')

      const agentMinimapNode = page.locator('[data-minimap-node-id^="agent:"]').first()
      await agentMinimapNode.focus()
      await agentMinimapNode.press('Enter')
      await expectProjectionColorContinuity(page, agentProjection, 'agent')
    },
    electronScenarioTimeoutMs
  )
})

interface AgentTerminalIdentity {
  readonly providerProcessId: string
  readonly sessionId: string
  readonly sourceTheme: 'dark' | 'light'
  readonly terminalProcessId: string
  readonly viewport: Locator
  readonly workspaceName: string
}

async function waitForAgentTerminal(
  page: Page,
  workspaceName: string,
  sourceTheme: 'dark' | 'light'
): Promise<AgentTerminalIdentity> {
  await page.waitForFunction(
    ({ source, workspace }) => {
      const viewport = Array.from(
        document.querySelectorAll<HTMLElement>('.agent-terminal-viewport')
      ).find((element) => element.dataset.agentTerminalWorkspaceName === workspace)

      return Boolean(
        viewport?.dataset.agentTerminalSessionId &&
        viewport.dataset.agentTerminalProcessId &&
        viewport.dataset.agentTerminalSourceTheme === source &&
        viewport.querySelector('.xterm-helper-textarea')
      )
    },
    { source: sourceTheme, workspace: workspaceName }
  )

  const viewport = page.locator(
    `.agent-terminal-viewport[data-agent-terminal-workspace-name="${workspaceName}"]`
  )
  await waitForTerminalDomText(viewport, fakeCodexMarker)
  const visibleOutput = await viewport.locator('.xterm-rows').textContent()
  expect(visibleOutput).not.toMatch(/(?:2)?;1H/)
  expect(visibleOutput).not.toContain('CLEANCODE_JOB:')
  expect(visibleOutput).not.toContain('cleancode-agent-job-')
  expect(visibleOutput).not.toContain('cleancode_job_status')
  const providerProcessId = visibleOutput?.match(
    new RegExp(`${fakeCodexMarker}:${sourceTheme}:(\\d+)`)
  )?.[1]
  const attributes = await viewport.evaluate((element) => ({
    processId: element.getAttribute('data-agent-terminal-process-id'),
    sessionId: element.getAttribute('data-agent-terminal-session-id'),
    sourceTheme: element.getAttribute('data-agent-terminal-source-theme'),
    workspaceName: element.getAttribute('data-agent-terminal-workspace-name')
  }))

  if (
    !attributes.processId ||
    !providerProcessId ||
    !attributes.sessionId ||
    (attributes.sourceTheme !== 'dark' && attributes.sourceTheme !== 'light') ||
    !attributes.workspaceName
  ) {
    throw new Error('Agent terminal stable identity attributes are incomplete.')
  }

  return {
    providerProcessId,
    sessionId: attributes.sessionId,
    sourceTheme: attributes.sourceTheme,
    terminalProcessId: attributes.processId,
    viewport,
    workspaceName: attributes.workspaceName
  }
}

async function waitForTerminalDomText(viewport: Locator, text: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    await ensureTerminalDomRenderer(viewport)
    const contents = await viewport
      .locator('.xterm-rows')
      .textContent()
      .catch(() => '')
    if (contents?.includes(text)) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for Agent terminal output: ${text}`)
}

async function expectTerminalPresentation(
  page: Page,
  viewport: Locator,
  visualTheme: 'dark' | 'light',
  shouldBeFiltered: boolean
): Promise<void> {
  const projection = viewport.locator('..')

  await expect
    .poll(() => projection.evaluate((element) => getComputedStyle(element).filter !== 'none'), {
      interval: 50,
      timeout: 5_000
    })
    .toBe(false)
  await expect
    .poll(() => viewport.evaluate((element) => getComputedStyle(element).filter !== 'none'), {
      interval: 50,
      timeout: 5_000
    })
    .toBe(shouldBeFiltered)

  const luminance = expect.poll(() => readCenterLuminance(page, viewport), {
    interval: 100,
    timeout: 5_000
  })

  if (visualTheme === 'dark') {
    await luminance.toBeLessThan(0.2)
  } else {
    await luminance.toBeGreaterThan(0.8)
  }
}

interface PixelColor {
  readonly blue: number
  readonly green: number
  readonly red: number
}

async function readProjectionColors(
  page: Page,
  projection: Locator
): Promise<{
  readonly bottom: PixelColor
  readonly content: PixelColor
  readonly left: PixelColor
  readonly top: PixelColor
}> {
  const geometry = await projection.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const content = element.firstElementChild
    if (!content) throw new Error('Terminal theme projection has no content.')
    const contentBounds = content.getBoundingClientRect()
    const leftInset = contentBounds.left - bounds.left
    const topInset = contentBounds.top - bounds.top
    const bottomInset = bounds.bottom - contentBounds.bottom

    return {
      cssHeight: bounds.height,
      cssWidth: bounds.width,
      sampleBottomY: bounds.height - bottomInset / 2,
      sampleContentX: contentBounds.right - bounds.left - 24,
      sampleContentY: contentBounds.top - bounds.top + contentBounds.height / 2,
      sampleLeftX: leftInset / 2,
      sampleTopY: topInset / 2
    }
  })
  const screenshot = await projection.screenshot()

  return page.evaluate(
    async ({
      base64Png,
      cssHeight,
      cssWidth,
      sampleBottomY,
      sampleContentX,
      sampleContentY,
      sampleLeftX,
      sampleTopY
    }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64Png}`
      await image.decode()

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Unable to sample terminal theme projection.')
      context.drawImage(image, 0, 0)

      const scaleX = canvas.width / cssWidth
      const scaleY = canvas.height / cssHeight
      const read = (cssX: number, cssY: number) => {
        const pixel = context.getImageData(
          Math.max(0, Math.min(canvas.width - 1, Math.round(cssX * scaleX))),
          Math.max(0, Math.min(canvas.height - 1, Math.round(cssY * scaleY))),
          1,
          1
        ).data
        return { blue: pixel[2]!, green: pixel[1]!, red: pixel[0]! }
      }

      return {
        bottom: read(sampleContentX, sampleBottomY),
        content: read(sampleContentX, sampleContentY),
        left: read(sampleLeftX, sampleContentY),
        top: read(sampleContentX, sampleTopY)
      }
    },
    {
      base64Png: screenshot.toString('base64'),
      ...geometry
    }
  )
}

async function expectProjectionColorContinuity(
  page: Page,
  projection: Locator,
  kind: 'agent' | 'terminal'
): Promise<void> {
  const content = projection
    .locator(':scope > .agent-terminal-viewport, :scope > .terminal-viewport')
    .first()
  await expect
    .poll(() => content.evaluate((element) => getComputedStyle(element).filter !== 'none'), {
      interval: 50,
      timeout: 5_000
    })
    .toBe(true)
  expect(await projection.evaluate((element) => getComputedStyle(element).filter)).toBe('none')
  await expect
    .poll(
      () =>
        projection.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          const canvasBounds = element.closest('.react-flow')?.getBoundingClientRect()
          return Boolean(
            canvasBounds &&
            bounds.left >= canvasBounds.left &&
            bounds.top >= canvasBounds.top &&
            bounds.right <= canvasBounds.right &&
            bounds.bottom <= canvasBounds.bottom
          )
        }),
      { interval: 50, timeout: 5_000 }
    )
    .toBe(true)

  const colors = await readProjectionColors(page, projection)
  const distances = {
    bottom: maximumColorDistance(colors.content, colors.bottom),
    left: maximumColorDistance(colors.content, colors.left),
    top: maximumColorDistance(colors.content, colors.top)
  }
  const message = `${kind} projection colors: ${JSON.stringify(colors)}`
  expect(distances.bottom, message).toBeLessThanOrEqual(2)
  expect(distances.left, message).toBeLessThanOrEqual(2)
  expect(distances.top, message).toBeLessThanOrEqual(2)
}

function maximumColorDistance(left: PixelColor, right: PixelColor): number {
  return Math.max(
    Math.abs(left.red - right.red),
    Math.abs(left.green - right.green),
    Math.abs(left.blue - right.blue)
  )
}

async function readCenterLuminance(page: Page, viewport: Locator): Promise<number> {
  const screenshot = await viewport.screenshot()

  return page.evaluate(async (base64Png) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64Png}`
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Unable to create screenshot sampling context.')
    }

    context.drawImage(image, 0, 0)
    const sampleSize = 5
    const pixels = context.getImageData(
      Math.floor((canvas.width - sampleSize) / 2),
      Math.floor((canvas.height - sampleSize) / 2),
      sampleSize,
      sampleSize
    ).data
    let luminance = 0

    for (let index = 0; index < pixels.length; index += 4) {
      luminance +=
        (0.2126 * pixels[index]! + 0.7152 * pixels[index + 1]! + 0.0722 * pixels[index + 2]!) / 255
    }

    return luminance / (pixels.length / 4)
  }, screenshot.toString('base64'))
}

async function expectFakeCodexSession(
  identity: AgentTerminalIdentity,
  expectedDirectory: string,
  reportPath: string
): Promise<void> {
  await expect
    .poll(async () => {
      const reports = await readFakeCodexCliReports(reportPath)
      return reports.some(
        (report) =>
          report.kind === 'session' &&
          String(report.pid) === identity.providerProcessId &&
          report.cwd === expectedDirectory
      )
    })
    .toBe(true)
}

function expectSessionReport(
  reports: readonly FakeCodexCliReport[],
  identity: AgentTerminalIdentity,
  expectedDirectory: string,
  sourceTheme: 'dark' | 'light'
): void {
  const matchingReports = reports.filter(
    (report) => report.kind === 'session' && String(report.pid) === identity.providerProcessId
  )

  expect(matchingReports).toHaveLength(1)
  expect(matchingReports[0]).toMatchObject({
    cwd: expectedDirectory,
    sourceTheme
  })
  expect(matchingReports[0]?.args).toContain('--no-alt-screen')
  expect(matchingReports[0]?.args).toContain(expectedDirectory)
}

async function waitForPersistedAgent(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const agentId = document
      .querySelector('[data-agent-console-node]')
      ?.getAttribute('data-agent-console-node')

    return Boolean(agentId && agentId !== 'default-agent')
  })
}

async function selectTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  const themeName = theme === 'light' ? '浅色' : '深色'

  await page.getByRole('button', { name: '主题设置' }).click()
  await page.getByText(themeName, { exact: true }).click()
  await page.waitForFunction((expectedTheme) => {
    return document.documentElement.dataset.theme === expectedTheme
  }, theme)
  await page.getByRole('button', { name: '关闭主题设置' }).click()
}

async function initializeGitProject(directory: string): Promise<void> {
  await execGit(directory, ['init', '--initial-branch=main'])
  await execGit(directory, ['config', 'user.email', 'test@example.com'])
  await execGit(directory, ['config', 'user.name', 'Test User'])
  await writeFile(join(directory, 'README.md'), 'hello\n')
  await execGit(directory, ['add', 'README.md'])
  await execGit(directory, ['commit', '-m', 'initial'])
}

async function expectCurrentGitBranch(directory: string, branchName: string): Promise<void> {
  await expect
    .poll(async () => {
      const { stdout } = await execGit(directory, ['branch', '--show-current'])
      return stdout.trim()
    })
    .toBe(branchName)
}

async function execGit(directory: string, args: readonly string[]) {
  return execFileAsync('git', [...args], {
    cwd: directory,
    env: createGitProcessEnvironment()
  })
}

function createGitProcessEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env }

  for (const variableName of gitLocalEnvironmentVariables) {
    delete environment[variableName]
  }

  return environment
}

function branchWorktreeDirectory(projectDirectory: string, branchName: string): string {
  return join(projectWorktreesDirectory(projectDirectory), ...branchName.split('/'))
}

function projectWorktreesDirectory(projectDirectory: string): string {
  return join(dirname(projectDirectory), 'worktrees', basename(projectDirectory))
}
