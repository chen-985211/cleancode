// @vitest-environment node

import { execFile } from 'node:child_process'
import { access, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  terminalWorkspaceRetentionEarlyMarker,
  terminalWorkspaceRetentionFixtureFileName,
  terminalWorkspaceRetentionInvisiblePadding,
  terminalWorkspaceRetentionLateMarker,
  terminalQueryFixtureFileName,
  writeTerminalQueryFixtureScript,
  writeTerminalWorkspaceRetentionFixtureScript
} from '../fixtures/contexts/run/fakeTerminalPrograms'
import {
  createE2eWorkbench,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readOnlyJsonFile,
  selectBlankCanvasAction,
  teardownE2eScenario,
  waitForTextFile,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { pollUntilState } from '../support/e2ePolling'
import {
  asE2eTerminalInput,
  createE2eFileCommand,
  createE2eNodeScriptCommand,
  createE2eTerminalEnvironment,
  expectTerminalWorkingDirectory,
  readTerminalSessionId,
  waitForTerminalOutput,
  waitForTerminalShellReady,
  writeTerminalCommand
} from '../support/e2eTerminal'
import { ensureTerminalDomRenderer } from '../support/terminalSelectionE2e'

const execFileAsync = promisify(execFile)
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

describe('git branch workspaces e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-git-e2e')
    resources.workbench = workbench
    await initializeGitProject(workbench.projectDirectory)
    electronApp = await launchApp(workbench, {
      environment: createE2eTerminalEnvironment()
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
    'creates a git worktree branch workspace and switches terminal working directories',
    { tags: 'smoke', timeout: electronScenarioTimeoutMs },
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()

      const projectCard = page.getByRole('group', {
        name: `项目 ${basename(workbench.projectDirectory)}`
      })
      const featureWorktreeDirectory = branchWorktreeDirectory(
        workbench.projectDirectory,
        'feature/sidebar'
      )

      await projectCard.getByRole('button', { name: '新建分支工作区' }).click()
      await projectCard.getByLabel('分支名称').fill('feature/sidebar')
      await projectCard.getByRole('button', { name: '创建 Worktree' }).click()
      const featureWorkspace = projectCard.getByRole('button', {
        name: /feature\/sidebar.*独立工作区/
      })
      await featureWorkspace.waitFor()
      await waitForCurrentWorkspace(featureWorkspace)
      await access(join(featureWorktreeDirectory, '.git'))
      const canonicalFeatureWorktreeDirectory = await realpath(featureWorktreeDirectory)
      await expectCurrentGitBranch(featureWorktreeDirectory, 'feature/sidebar')

      await selectBlankCanvasAction(page, '新建终端积木')
      await waitForTerminalShellReady(page, 'Terminal 1')
      const featureSessionId = await readTerminalSessionId(page, 'Terminal 1')
      await expectTerminalWorkingDirectory(page, 'Terminal 1', featureWorktreeDirectory)

      const mainWorkspace = projectCard.locator('.default-branch-selector__select')
      await mainWorkspace.click()
      await waitForCurrentWorkspace(mainWorkspace)
      await waitForTerminalSessionDetached(page, featureSessionId)
      await selectBlankCanvasAction(page, '新建终端积木')
      await waitForTerminalShellReady(page, 'Terminal 1')
      expect(await readTerminalSessionId(page, 'Terminal 1')).not.toBe(featureSessionId)
      await expectTerminalWorkingDirectory(page, 'Terminal 1', workbench.projectDirectory)

      const projectMetadata = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'project.json')
      ) as {
        workspaces: Array<{
          workspaceId: string
          workspaceKind: 'default' | 'linked-worktree'
          displayName: string
          directory: string
          gitBranch: string | null
          isCurrent: boolean
        }>
      }

      expect(projectMetadata.workspaces).toEqual([
        {
          workspaceId: expect.any(String),
          workspaceKind: 'default',
          displayName: 'main',
          directory: workbench.projectDirectory,
          gitBranch: 'main',
          isCurrent: true
        },
        {
          workspaceId: expect.any(String),
          workspaceKind: 'linked-worktree',
          displayName: 'feature/sidebar',
          directory: canonicalFeatureWorktreeDirectory,
          gitBranch: 'feature/sidebar',
          isCurrent: false
        }
      ])
    }
  )

  it(
    'shows an existing Git branch error in the global notification system instead of the sidebar',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()

      const projectCard = page.getByRole('group', {
        name: `项目 ${basename(workbench.projectDirectory)}`
      })
      await projectCard.getByRole('button', { name: '新建分支工作区' }).click()
      await projectCard.getByLabel('分支名称').fill('main')
      await projectCard.getByRole('button', { name: '创建 Worktree' }).click()

      const notificationViewport = page.getByLabel('通知', { exact: true })
      const errorAlert = notificationViewport.getByRole('alert')
      await errorAlert.getByText('创建分支工作区失败', { exact: true }).waitFor()
      await errorAlert.getByText('无法创建分支工作区。', { exact: true }).waitFor()

      expect(await projectCard.getByRole('alert').count()).toBe(0)
    },
    electronScenarioTimeoutMs
  )

  it(
    'keeps bounded terminal scrollback and background output across worktree switches',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()

      const projectCard = page.getByRole('group', {
        name: `项目 ${basename(workbench.projectDirectory)}`
      })
      const branchName = 'feature/terminal-retention'
      const featureWorktreeDirectory = branchWorktreeDirectory(
        workbench.projectDirectory,
        branchName
      )

      await projectCard.getByRole('button', { name: '新建分支工作区' }).click()
      await projectCard.getByLabel('分支名称').fill(branchName)
      await projectCard.getByRole('button', { name: '创建 Worktree' }).click()
      const featureWorkspace = projectCard.getByRole('button', {
        name: /feature\/terminal-retention.*独立工作区/
      })
      await featureWorkspace.waitFor()
      await waitForCurrentWorkspace(featureWorkspace)
      await selectBlankCanvasAction(page, '新建终端积木')
      await waitForTerminalShellReady(page, 'Terminal 1')

      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(
          createE2eNodeScriptCommand(
            join(featureWorktreeDirectory, terminalWorkspaceRetentionFixtureFileName)
          )
        )
      )
      await waitForTerminalOutput(page, 'Terminal 1', terminalWorkspaceRetentionLateMarker)
      const sessionId = await readTerminalSessionId(page, 'Terminal 1')
      await waitForVisibleXtermText(page, sessionId, terminalWorkspaceRetentionLateMarker)
      const visibleQueryReport = join(featureWorktreeDirectory, 'visible-query-report.json')
      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(
          createE2eNodeScriptCommand(join(featureWorktreeDirectory, terminalQueryFixtureFileName), [
            visibleQueryReport
          ])
        )
      )
      const visibleQuery = JSON.parse(await waitForTextFile(visibleQueryReport)) as {
        readonly count: number
        readonly backgroundCount: number
        readonly backgroundResponses: readonly string[]
      }
      const expectedBackgroundCount = process.platform === 'win32' ? 0 : 1
      expect(visibleQuery).toMatchObject({
        count: 1,
        backgroundCount: expectedBackgroundCount
      })
      const terminalSurfaceToken = '__TERMINAL_SURFACE_INSTANCE__'
      await markTerminalSurface(page, sessionId, terminalSurfaceToken)

      const boundedOutputTail = await readTerminalOutputTail(page, sessionId)
      expect(terminalWorkspaceRetentionInvisiblePadding.length).toBeGreaterThan(8192)
      expect(boundedOutputTail.length).toBeLessThanOrEqual(8192)
      expect(boundedOutputTail).toContain(terminalWorkspaceRetentionLateMarker)

      const mainWorkspace = projectCard.locator('.default-branch-selector__select')
      await mainWorkspace.click()
      await waitForCurrentWorkspace(mainWorkspace)
      await waitForTerminalSessionDetached(page, sessionId)

      const hiddenOutputMarker = '__TERMINAL_HIDDEN_WORKSPACE_OUTPUT__'
      const hiddenOutputReport = join(featureWorktreeDirectory, 'hidden-output-report.txt')
      const hiddenOutputInput = asE2eTerminalInput(
        createE2eFileCommand({
          files: { [hiddenOutputReport]: 'done' },
          output: hiddenOutputMarker
        })
      )
      await page.evaluate(
        ({ hiddenOutputInput, sessionId }) =>
          window.cleancode?.writeTerminal({
            sessionId,
            input: hiddenOutputInput
          }),
        { hiddenOutputInput, sessionId }
      )
      expect(await waitForTextFile(hiddenOutputReport)).toBe('done')
      const hiddenQueryReport = join(featureWorktreeDirectory, 'hidden-query-report.json')
      const hiddenQueryInput = asE2eTerminalInput(
        createE2eNodeScriptCommand(join(featureWorktreeDirectory, terminalQueryFixtureFileName), [
          hiddenQueryReport
        ])
      )
      await page.evaluate(
        ({ hiddenQueryInput, sessionId }) =>
          window.cleancode?.writeTerminal({
            sessionId,
            input: hiddenQueryInput
          }),
        { hiddenQueryInput, sessionId }
      )
      const hiddenQuery = JSON.parse(await waitForTextFile(hiddenQueryReport)) as {
        readonly count: number
        readonly backgroundCount: number
        readonly backgroundResponses: readonly string[]
      }
      expect(hiddenQuery).toMatchObject({
        count: 1,
        backgroundCount: expectedBackgroundCount
      })
      expect(hiddenQuery.backgroundResponses).toEqual(visibleQuery.backgroundResponses)

      await featureWorkspace.click()
      await waitForCurrentWorkspace(featureWorkspace)
      await waitForRecreatedTerminalSurface(page, sessionId, terminalSurfaceToken)
      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(sessionId)
      await waitForVisibleXtermText(page, sessionId, hiddenOutputMarker)
      await scrollTerminalToTop(page, sessionId)
      await waitForVisibleXtermText(page, sessionId, terminalWorkspaceRetentionEarlyMarker)
    },
    electronScenarioTimeoutMs
  )
})

async function initializeGitProject(directory: string): Promise<void> {
  await execGit(directory, ['init', '--initial-branch=main'])
  await execGit(directory, ['config', 'user.email', 'test@example.com'])
  await execGit(directory, ['config', 'user.name', 'Test User'])
  await writeFile(join(directory, 'README.md'), 'hello\n')
  await writeTerminalWorkspaceRetentionFixtureScript(directory)
  await writeTerminalQueryFixtureScript(directory)
  await execGit(directory, [
    'add',
    'README.md',
    terminalWorkspaceRetentionFixtureFileName,
    terminalQueryFixtureFileName
  ])
  await execGit(directory, ['commit', '-m', 'initial'])
}

async function readTerminalOutputTail(page: Page, sessionId: string): Promise<string> {
  return page.evaluate(
    (targetSessionId) =>
      document.querySelector<HTMLElement>(
        `[data-terminal-output-tail][data-terminal-session-id="${targetSessionId}"]`
      )?.textContent ?? '',
    sessionId
  )
}

async function waitForTerminalSessionDetached(page: Page, sessionId: string): Promise<void> {
  await page
    .locator(`[data-terminal-output-tail][data-terminal-session-id="${sessionId}"]`)
    .waitFor({ state: 'detached' })
}

async function waitForCurrentWorkspace(workspace: Locator): Promise<void> {
  const ariaCurrent = await pollUntilState({
    description: 'selected branch workspace to become current',
    observe: () => workspace.getAttribute('aria-current'),
    accept: (value) => value === 'page',
    timeoutMs: 10_000
  })

  expect(ariaCurrent).toBe('page')
}

async function markTerminalSurface(page: Page, sessionId: string, token: string): Promise<void> {
  await page.evaluate(
    ({ sessionId, token }) => {
      const outputTail = document.querySelector<HTMLElement>(
        `[data-terminal-output-tail][data-terminal-session-id="${sessionId}"]`
      )
      const surface = outputTail
        ?.closest('.terminal-output-shell')
        ?.querySelector<HTMLElement>('.xterm')

      if (!surface) {
        throw new Error('The terminal surface is not attached to the current session.')
      }

      surface.dataset.workspaceRetentionToken = token
    },
    { sessionId, token }
  )
}

async function waitForRecreatedTerminalSurface(
  page: Page,
  sessionId: string,
  previousToken: string
): Promise<void> {
  await page.waitForFunction(
    ({ previousToken, sessionId }) => {
      const outputTail = document.querySelector<HTMLElement>(
        `[data-terminal-output-tail][data-terminal-session-id="${sessionId}"]`
      )
      const surface = outputTail
        ?.closest('.terminal-output-shell')
        ?.querySelector<HTMLElement>('.xterm')

      return Boolean(surface && surface.dataset.workspaceRetentionToken !== previousToken)
    },
    { previousToken, sessionId }
  )
}

async function scrollTerminalToTop(page: Page, sessionId: string): Promise<void> {
  const didFocusTerminal = await page.evaluate((targetSessionId) => {
    const outputTail = document.querySelector<HTMLElement>(
      `[data-terminal-output-tail][data-terminal-session-id="${targetSessionId}"]`
    )
    const terminalViewport = outputTail
      ?.closest('.terminal-output-shell')
      ?.querySelector<HTMLElement>('.terminal-viewport')

    if (!terminalViewport) {
      return false
    }

    terminalViewport.focus()
    return true
  }, sessionId)

  if (!didFocusTerminal) {
    throw new Error('The terminal viewport is not attached to the current session.')
  }
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    await page.keyboard.press('Shift+PageUp')
  }
}

async function waitForVisibleXtermText(
  page: Page,
  sessionId: string,
  expectedText: string
): Promise<void> {
  const outputTail = page.locator(
    `[data-terminal-output-tail][data-terminal-session-id="${sessionId}"]`
  )
  const terminal = page
    .locator('.terminal-output-shell')
    .filter({ has: outputTail })
    .locator('.terminal-viewport')
  await ensureTerminalDomRenderer(terminal)
  await page.waitForFunction(
    ({ expectedText, sessionId }) => {
      const outputTail = document.querySelector<HTMLElement>(
        `[data-terminal-output-tail][data-terminal-session-id="${sessionId}"]`
      )

      return (
        outputTail
          ?.closest('.terminal-output-shell')
          ?.querySelector<HTMLElement>('.xterm-rows')
          ?.textContent?.includes(expectedText) ?? false
      )
    },
    { expectedText, sessionId }
  )
}

async function expectCurrentGitBranch(directory: string, branchName: string): Promise<void> {
  await pollUntilState({
    description: `Git branch ${branchName} in ${directory}`,
    observe: async () => (await execGit(directory, ['branch', '--show-current'])).stdout.trim(),
    accept: (currentBranch) => currentBranch === branchName,
    intervalMs: 100,
    timeoutMs: 5_000
  })
}

async function execGit(directory: string, args: readonly string[]) {
  return execFileAsync('git', [...args], {
    cwd: directory,
    env: createGitProcessEnvironment()
  })
}

function createGitProcessEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }

  for (const variableName of gitLocalEnvironmentVariables) {
    delete env[variableName]
  }

  return env
}

function branchWorktreeDirectory(projectDirectory: string, branchName: string): string {
  return join(projectWorktreesDirectory(projectDirectory), ...branchName.split('/'))
}

function projectWorktreesDirectory(projectDirectory: string): string {
  return join(dirname(projectDirectory), 'worktrees', basename(projectDirectory))
}
