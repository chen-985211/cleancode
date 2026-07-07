// @vitest-environment node

import { execFile } from 'node:child_process'
import { access, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  buildElectronApp,
  cleanupE2eWorkbench,
  createE2eWorkbench,
  electronBuildTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readOnlyJsonFile,
  type E2eWorkbench
} from '../support/e2eWorkbench'

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

  beforeAll(async () => {
    await buildElectronApp()
  }, electronBuildTimeoutMs)

  beforeEach(async () => {
    workbench = await createE2eWorkbench('cleancode-git-e2e')
    await initializeGitProject(workbench.projectDirectory)
    electronApp = await launchApp(workbench)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  }, electronScenarioTimeoutMs)

  afterEach(async () => {
    await electronApp.close()
    await rm(projectWorktreesDirectory(workbench.projectDirectory), {
      recursive: true,
      force: true
    })
    await cleanupE2eWorkbench(workbench)
  }, electronScenarioTimeoutMs)

  it(
    'creates a git worktree branch workspace and switches terminal working directories',
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
      await projectCard.getByRole('button', { name: '创建分支工作区' }).click()
      await projectCard.getByRole('button', { name: /feature\/sidebar.*worktree/ }).waitFor()
      await access(join(featureWorktreeDirectory, '.git'))
      await expectCurrentGitBranch(featureWorktreeDirectory, 'feature/sidebar')

      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('运行中').waitFor()
      await expectTerminalPwd(page, 'Terminal 1', featureWorktreeDirectory)

      await chooseDefaultBranch(projectCard, 'main')
      await page.getByText('Terminal 1').waitFor({ state: 'detached' })
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('运行中').waitFor()
      await expectTerminalPwd(page, 'Terminal 1', workbench.projectDirectory)

      const projectMetadata = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'project.json')
      ) as {
        workspaces: Array<{
          name: string
          directory: string
          gitBranch: string | null
          isCurrent: boolean
        }>
      }

      expect(projectMetadata.workspaces).toEqual([
        {
          name: 'main',
          directory: workbench.projectDirectory,
          gitBranch: 'main',
          isCurrent: true
        },
        {
          name: 'feature/sidebar',
          directory: featureWorktreeDirectory,
          gitBranch: 'feature/sidebar',
          isCurrent: false
        }
      ])
    },
    electronScenarioTimeoutMs
  )
})

async function initializeGitProject(directory: string): Promise<void> {
  await execGit(directory, ['init', '--initial-branch=main'])
  await execGit(directory, ['config', 'user.email', 'test@example.com'])
  await execGit(directory, ['config', 'user.name', 'Test User'])
  await writeFile(join(directory, 'README.md'), 'hello\n')
  await execGit(directory, ['add', 'README.md'])
  await execGit(directory, ['commit', '-m', 'initial'])
}

async function expectTerminalPwd(
  page: Page,
  terminalName: string,
  expectedDirectory: string
): Promise<void> {
  const sessionId = await readTerminalSessionId(page, terminalName)

  await page.evaluate(
    ({ input, targetSessionId }) =>
      window.cleancode?.writeTerminal({ sessionId: targetSessionId, input }),
    { targetSessionId: sessionId, input: 'pwd\r' }
  )
  await page.waitForFunction(
    ({ label, directory }) =>
      document
        .querySelector(`[aria-label="${label} 文本输出"]`)
        ?.textContent?.includes(directory) ?? false,
    { label: terminalName, directory: expectedDirectory }
  )
}

async function readTerminalSessionId(page: Page, terminalName: string): Promise<string> {
  const sessionIdHandle = await page.waitForFunction(
    (label) =>
      document
        .querySelector(`[aria-label="${label} 文本输出"]`)
        ?.getAttribute('data-terminal-session-id') ?? '',
    terminalName
  )

  return sessionIdHandle.jsonValue()
}

async function chooseDefaultBranch(projectCard: Locator, branchName: string): Promise<void> {
  await projectCard.getByRole('button', { name: /默认工作区分支/ }).click()
  const branchDialog = projectCard.getByRole('dialog', { name: '选择默认工作区分支' })

  await branchDialog.waitFor()
  await branchDialog
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(branchName)}$`) })
    .click()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function expectCurrentGitBranch(directory: string, branchName: string): Promise<void> {
  const deadline = Date.now() + 5_000
  let currentBranch = ''

  while (Date.now() < deadline) {
    const { stdout } = await execGit(directory, ['branch', '--show-current'])

    currentBranch = stdout.trim()

    if (currentBranch === branchName) {
      return
    }

    await new Promise((resolveTimer) => setTimeout(resolveTimer, 100))
  }

  expect(currentBranch).toBe(branchName)
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
