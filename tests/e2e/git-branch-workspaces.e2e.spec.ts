// @vitest-environment node

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

import {
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page
} from 'playwright'

const execFileAsync = promisify(execFile)
const electronBuildTimeoutMs = 45_000
const electronScenarioTimeoutMs = 60_000
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
  let projectDirectory: string
  let registryDirectory: string
  let appStateDirectory: string
  let electronApp: ElectronApplication | null
  let page: Page

  beforeAll(async () => {
    await execFileAsync('pnpm', ['exec', 'electron-vite', 'build'], {
      cwd: process.cwd()
    })
  }, electronBuildTimeoutMs)

  beforeEach(async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'cleancode-git-e2e-project-'))
    registryDirectory = await mkdtemp(join(tmpdir(), 'cleancode-git-e2e-registry-'))
    appStateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-git-e2e-state-'))
    await initializeGitProject(projectDirectory)
    electronApp = await launchApp(projectDirectory, registryDirectory, appStateDirectory)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  }, electronScenarioTimeoutMs)

  afterEach(async () => {
    if (electronApp) {
      await electronApp.close()
      electronApp = null
    }

    await rm(projectWorktreesDirectory(projectDirectory), { recursive: true, force: true })
    await rm(projectDirectory, { recursive: true, force: true })
    await rm(registryDirectory, { recursive: true, force: true })
    await rm(appStateDirectory, { recursive: true, force: true })
  }, electronScenarioTimeoutMs)

  it(
    'creates a git worktree branch workspace and switches terminal working directories',
    async () => {
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: '添加项目' }).click()

      const projectCard = page.getByRole('group', { name: `项目 ${basename(projectDirectory)}` })
      const featureWorktreeDirectory = branchWorktreeDirectory(projectDirectory, 'feature/sidebar')

      await projectCard.getByRole('button', { name: '新建分支工作区' }).click()
      await projectCard.getByLabel('分支名称').fill('feature/sidebar')
      await projectCard.getByRole('button', { name: '创建分支工作区' }).click()
      await projectCard.getByRole('button', { name: /feature\/sidebar.*worktree/ }).waitFor()
      await access(join(featureWorktreeDirectory, '.git'))
      await expectCurrentGitBranch(featureWorktreeDirectory, 'feature/sidebar')

      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()
      await page.getByText('运行中').waitFor()
      await expectTerminalPwd(page, 'Terminal 1', featureWorktreeDirectory)

      await chooseDefaultBranch(projectCard, 'main')
      await page.getByText('Terminal 1').waitFor({ state: 'detached' })
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()
      await page.getByText('运行中').waitFor()
      await expectTerminalPwd(page, 'Terminal 1', projectDirectory)

      const projectMetadata = JSON.parse(
        await readFile(projectMetadataPath(appStateDirectory, projectDirectory), 'utf8')
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
          directory: projectDirectory,
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

  it(
    'checks out local branches in main while keeping existing worktree branches separate',
    async () => {
      const existingWorktreeDirectory = join(appStateDirectory, 'existing-feature-worktree')

      await createLocalBranch(projectDirectory, 'feature/free')
      await createExistingWorktree(projectDirectory, existingWorktreeDirectory, 'feature/worktree')
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: '添加项目' }).click()

      const projectCard = page.getByRole('group', { name: `项目 ${basename(projectDirectory)}` })
      expect(await projectCard.getByRole('button', { name: /feature\/free/ }).count()).toBe(0)

      const branchDialog = await openDefaultBranchSelector(projectCard)
      await expectBranchSelectorOpensBesideDefaultBranch(projectCard, branchDialog)
      const freeBranch = branchDialog.getByRole('button', { name: 'feature/free' })
      const disabledWorktreeBranch = branchDialog.getByRole('button', {
        name: /feature\/worktree.*独立工作区/
      })

      await freeBranch.waitFor()
      await disabledWorktreeBranch.waitFor()
      expect(await freeBranch.isEnabled()).toBe(true)
      expect(await disabledWorktreeBranch.isDisabled()).toBe(true)

      await freeBranch.click()
      await projectCard.getByRole('button', { name: '切换到默认工作区 feature/free' }).waitFor()
      await expectCurrentGitBranch(projectDirectory, 'feature/free')
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()
      await page.getByText('运行中').waitFor()
      await expectTerminalPwd(page, 'Terminal 1', projectDirectory)

      await projectCard
        .locator('.workspace-row')
        .filter({ hasText: 'feature/worktree' })
        .first()
        .click()
      await page.getByText('Terminal 1').waitFor({ state: 'detached' })
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()
      await page.getByText('运行中').waitFor()
      await expectTerminalPwd(page, 'Terminal 1', await realpath(existingWorktreeDirectory))
    },
    electronScenarioTimeoutMs
  )

  it(
    'archives a clean worktree while keeping its git branch selectable',
    async () => {
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: '添加项目' }).click()

      const projectCard = page.getByRole('group', { name: `项目 ${basename(projectDirectory)}` })
      const featureWorktreeDirectory = branchWorktreeDirectory(projectDirectory, 'feature/sidebar')

      await projectCard.getByRole('button', { name: '新建分支工作区' }).click()
      await projectCard.getByLabel('分支名称').fill('feature/sidebar')
      await projectCard.getByRole('button', { name: '创建分支工作区' }).click()
      await projectCard.getByRole('button', { name: /feature\/sidebar.*worktree/ }).waitFor()
      await access(join(featureWorktreeDirectory, '.git'))

      await projectCard.getByRole('button', { name: '打开 feature/sidebar 工作区菜单' }).click()
      await projectCard.getByRole('menuitem', { name: '归档工作区' }).click()

      const archiveDialog = page.getByRole('dialog', { name: '归档工作区 feature/sidebar' })

      await archiveDialog.waitFor()
      expect(await archiveDialog.textContent()).toContain('归档前将自动切回默认工作区')

      await archiveDialog.getByRole('button', { name: '归档工作区' }).click()
      await archiveDialog.waitFor({ state: 'detached' })
      await projectCard
        .getByRole('button', { name: /feature\/sidebar.*worktree/ })
        .waitFor({ state: 'detached' })
      await expectPathMissing(featureWorktreeDirectory)
      await expectLocalBranch(projectDirectory, 'feature/sidebar')

      const branchDialog = await openDefaultBranchSelector(projectCard)
      const archivedBranch = branchDialog.getByRole('button', { name: /^feature\/sidebar$/ })

      await archivedBranch.waitFor()
      expect(await archivedBranch.isEnabled()).toBe(true)
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

async function createLocalBranch(directory: string, branchName: string): Promise<void> {
  await execGit(directory, ['branch', branchName])
}

async function createExistingWorktree(
  directory: string,
  worktreeDirectory: string,
  branchName: string
): Promise<void> {
  await execGit(directory, ['worktree', 'add', '-b', branchName, worktreeDirectory])
}

async function launchApp(
  projectDirectory: string,
  registryDirectory: string,
  appStateDirectory: string
): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLEANCODE_TEST_PROJECT_DIRECTORY: projectDirectory,
      CLEANCODE_TEST_APP_STATE_DIRECTORY: appStateDirectory,
      CLEANCODE_TEST_PROJECT_REGISTRY_PATH: join(registryDirectory, 'project-registry.json')
    }
  })
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

async function openDefaultBranchSelector(projectCard: Locator): Promise<Locator> {
  await projectCard.getByRole('button', { name: /默认工作区分支/ }).click()

  const branchDialog = projectCard.getByRole('dialog', { name: '选择默认工作区分支' })

  await branchDialog.waitFor()

  return branchDialog
}

async function chooseDefaultBranch(projectCard: Locator, branchName: string): Promise<void> {
  const branchDialog = await openDefaultBranchSelector(projectCard)

  await branchDialog
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(branchName)}$`) })
    .click()
}

async function expectBranchSelectorOpensBesideDefaultBranch(
  projectCard: Locator,
  branchDialog: Locator
): Promise<void> {
  const triggerBox = await projectCard.getByRole('button', { name: /默认工作区分支/ }).boundingBox()
  const dialogBox = await branchDialog.boundingBox()

  expect(triggerBox).not.toBeNull()
  expect(dialogBox).not.toBeNull()
  expect(dialogBox!.x).toBeGreaterThan(triggerBox!.x + triggerBox!.width)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function expectDesktopRuntime(page: Page): Promise<void> {
  const runtimeState = await page.evaluate(() => ({
    hasCleancodeApi: Boolean(window.cleancode),
    hasPreviewWarning: document.body.textContent?.includes('浏览器预览模式') ?? false
  }))

  expect(runtimeState).toEqual({
    hasCleancodeApi: true,
    hasPreviewWarning: false
  })
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

async function expectPathMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
}

async function expectLocalBranch(directory: string, branchName: string): Promise<void> {
  const { stdout } = await execGit(directory, ['branch', '--format=%(refname:short)'])
  const branchNames = stdout
    .split('\n')
    .map((branch) => branch.trim())
    .filter(Boolean)

  expect(branchNames).toContain(branchName)
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

function projectMetadataPath(appStateDirectory: string, projectDirectory: string): string {
  return join(projectStateDirectory(appStateDirectory, projectDirectory), 'project.json')
}

function branchWorktreeDirectory(projectDirectory: string, branchName: string): string {
  return join(projectWorktreesDirectory(projectDirectory), ...branchName.split('/'))
}

function projectWorktreesDirectory(projectDirectory: string): string {
  return join(dirname(projectDirectory), 'worktrees', basename(projectDirectory))
}

function projectStateDirectory(appStateDirectory: string, projectDirectory: string): string {
  return join(appStateDirectory, 'projects', projectStorageKey(projectDirectory))
}

function projectStorageKey(projectDirectory: string): string {
  return createHash('sha256').update(resolve(projectDirectory)).digest('hex')
}
