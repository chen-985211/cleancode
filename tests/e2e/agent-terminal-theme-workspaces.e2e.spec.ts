// @vitest-environment node

import { execFile } from 'node:child_process'
import { access, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
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
  readOnlyJsonFile,
  selectBlankCanvasAction,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { waitForAgentProviderInstalled } from '../support/e2eAgentRuntime'
import { selectAgentProviderFromCreateMenu } from '../support/e2eCanvasMenu'
import { pollUntilState } from '../support/e2ePolling'
import {
  createE2eTerminalEnvironment,
  prependE2ePath,
  readTerminalSessionId,
  waitForTerminalShellReady
} from '../support/e2eTerminal'
import { waitForTerminalDomText } from '../support/terminalSelectionE2e'
import {
  expectProjectionColorContinuity,
  expectTerminalPresentation
} from '../support/terminalThemeE2e'

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
        ...createE2eTerminalEnvironment(),
        CLEANCODE_FAKE_CODEX_REPORT_PATH: fakeCodex.reportPath,
        CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '0',
        PATH: prependE2ePath(fakeCodex.binDirectory)
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
      await waitForAgentProviderInstalled(page, 'codex')
      await createCodexAgent(page)
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

      await page.getByRole('button', { name: '新建 Agent' }).click()
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
      await createCodexAgent(page)
      await waitForPersistedAgent(page)
      await selectBlankCanvasAction(page, '新建终端积木')

      const terminalProjection = page.locator(
        '[data-terminal-block-id] .terminal-theme-projection[data-terminal-source-theme="light"]'
      )
      const agentProjection = page.locator(
        '[data-agent-console-node] .terminal-theme-projection[data-terminal-source-theme="light"]'
      )
      await terminalProjection
        .locator('.terminal-viewport .xterm-helper-textarea')
        .waitFor({ state: 'attached' })
      await agentProjection
        .locator('.agent-terminal-viewport .xterm-helper-textarea')
        .waitFor({ state: 'attached' })

      await selectTheme(page, 'dark')
      await expectProjectionColorContinuity(page, terminalProjection, 'terminal')

      const agentMinimapNode = page.locator('[data-minimap-node-id^="agent:"]').first()
      await agentMinimapNode.focus()
      await agentMinimapNode.press('Enter')
      await expectProjectionColorContinuity(page, agentProjection, 'agent')
    },
    electronScenarioTimeoutMs
  )

  it(
    'keeps the default workspace Agent, terminal, graph, and workspace identity across branch checkout',
    async () => {
      const branchName = 'feature/default-workspace-identity'
      await execGit(workbench.projectDirectory, ['branch', branchName])
      await expectDesktopRuntime(page)
      await selectTheme(page, 'light')
      await page.getByRole('button', { name: '添加项目' }).click()
      await createCodexAgent(page)
      await waitForPersistedAgent(page)
      await selectBlankCanvasAction(page, '新建终端积木')
      await waitForTerminalShellReady(page, 'Terminal 1')

      const agentBefore = await waitForAgentTerminal(page, 'main', 'light')
      const terminalSessionId = await readTerminalSessionId(page, 'Terminal 1')
      const terminalBefore = await readTerminalRuntime(page, terminalSessionId)
      const metadataBefore = await readProjectMetadata(workbench)
      const defaultWorkspaceBefore = metadataBefore.workspaces.find(
        (workspace) => workspace.workspaceKind === 'default'
      )
      expect(defaultWorkspaceBefore).toMatchObject({
        workspaceId: agentBefore.workspaceId,
        gitBranch: 'main'
      })

      const projectCard = page.getByRole('group', {
        name: `项目 ${basename(workbench.projectDirectory)}`
      })
      await projectCard.getByRole('button', { name: /选择默认工作区分支/ }).click()
      await page
        .getByRole('dialog', { name: '选择默认工作区分支' })
        .getByRole('button', {
          name: branchName,
          exact: true
        })
        .click()
      await expectCurrentGitBranch(workbench.projectDirectory, branchName)

      const agentAfter = await waitForAgentTerminal(page, 'main', 'light')
      await waitForTerminalShellReady(page, 'Terminal 1')
      const terminalAfterId = await readTerminalSessionId(page, 'Terminal 1')
      const terminalAfter = await readTerminalRuntime(page, terminalAfterId)
      const metadataAfter = await readProjectMetadata(workbench)
      const defaultWorkspaceAfter = metadataAfter.workspaces.find(
        (workspace) => workspace.workspaceKind === 'default'
      )

      expect(agentAfter).toMatchObject({
        workspaceId: agentBefore.workspaceId,
        sessionId: agentBefore.sessionId,
        terminalProcessId: agentBefore.terminalProcessId,
        providerProcessId: agentBefore.providerProcessId
      })
      expect(terminalAfterId).toBe(terminalSessionId)
      expect(terminalAfter.processId).toBe(terminalBefore.processId)
      expect(defaultWorkspaceAfter).toMatchObject({
        workspaceId: defaultWorkspaceBefore?.workspaceId,
        gitBranch: branchName
      })
      expect(await readFakeCodexCliReports(fakeCodex.reportPath)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'session',
            pid: Number(agentBefore.providerProcessId)
          })
        ])
      )
      expect(
        (await readFakeCodexCliReports(fakeCodex.reportPath)).filter(
          (report) => report.kind === 'session'
        )
      ).toHaveLength(1)
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
  readonly workspaceId: string
}

async function waitForAgentTerminal(
  page: Page,
  workspaceDisplayName: string,
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
    { source: sourceTheme, workspace: workspaceDisplayName }
  )

  const viewport = page.locator(
    `.agent-terminal-viewport[data-agent-terminal-workspace-name="${workspaceDisplayName}"]`
  )
  await waitForTerminalDomText(viewport, fakeCodexMarker, 15_000)
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
    workspaceId: element.getAttribute('data-agent-terminal-workspace-id')
  }))

  if (
    !attributes.processId ||
    !providerProcessId ||
    !attributes.sessionId ||
    (attributes.sourceTheme !== 'dark' && attributes.sourceTheme !== 'light') ||
    !attributes.workspaceId
  ) {
    throw new Error('Agent terminal stable identity attributes are incomplete.')
  }

  return {
    providerProcessId,
    sessionId: attributes.sessionId,
    sourceTheme: attributes.sourceTheme,
    terminalProcessId: attributes.processId,
    viewport,
    workspaceId: attributes.workspaceId
  }
}

async function readTerminalRuntime(page: Page, sessionId: string) {
  const runtime = await page.evaluate(async (targetSessionId) => {
    const sessions =
      (await window.cleancode?.listTerminalSessions({ sessionIds: [targetSessionId] })) ?? []
    return sessions.find((session) => session.id === targetSessionId) ?? null
  }, sessionId)

  if (!runtime) {
    throw new Error(`Terminal runtime ${sessionId} was not found.`)
  }

  return runtime
}

async function readProjectMetadata(workbench: E2eWorkbench): Promise<{
  readonly workspaces: readonly {
    readonly gitBranch: string | null
    readonly workspaceId: string
    readonly workspaceKind: 'default' | 'linked-worktree'
  }[]
}> {
  return JSON.parse(await readOnlyJsonFile(workbench.appStateDirectory, 'project.json'))
}

async function expectFakeCodexSession(
  identity: AgentTerminalIdentity,
  expectedDirectory: string,
  reportPath: string
): Promise<void> {
  await pollUntilState({
    description: `fake Codex session ${identity.providerProcessId} to report ${expectedDirectory}`,
    observe: async () => {
      const reports = await readFakeCodexCliReports(reportPath)
      return reports.some(
        (report) =>
          report.kind === 'session' &&
          String(report.pid) === identity.providerProcessId &&
          report.cwd === expectedDirectory
      )
    },
    accept: Boolean,
    timeoutMs: 10_000
  })
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

async function createCodexAgent(page: Page): Promise<void> {
  await selectAgentProviderFromCreateMenu(page, 'Codex')
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
  const currentBranch = await pollUntilState({
    description: `Git branch to become ${branchName}`,
    observe: async () => {
      const { stdout } = await execGit(directory, ['branch', '--show-current'])
      return stdout.trim()
    },
    accept: (branch) => branch === branchName,
    timeoutMs: 10_000
  })

  expect(currentBranch).toBe(branchName)
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
