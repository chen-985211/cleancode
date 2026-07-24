// @vitest-environment node

import { execFile } from 'node:child_process'
import { writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  createE2eWorkbench,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import {
  createE2eTerminalEnvironment,
  createE2eNodeScriptCommand,
  readTerminalSessionId
} from '../support/e2eTerminal'

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

describe('service port management across worktrees e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-service-port-worktrees-e2e')
    resources.workbench = workbench
    await initializeGitProjectWithHttpService(workbench.projectDirectory)
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
    'keeps authoritative endpoints when two worktrees share one preferred port',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()

      const preferredPort = await findAvailableLoopbackPort()
      const projectCard = page.getByRole('group', {
        name: `项目 ${basename(workbench.projectDirectory)}`
      })

      await createBranchWorkspace(projectCard, 'feature/service-one')
      const firstTerminal = await createPreferredHttpServiceTerminal(page, preferredPort)
      const firstEndpoint = await waitForActualServiceAddress(firstTerminal)

      expect(firstEndpoint).toBe(`http://127.0.0.1:${preferredPort}`)
      expect(await firstTerminal.getByText(/首选 .*已占用，已改用/).count()).toBe(0)

      await createBranchWorkspace(projectCard, 'feature/service-two')
      await firstTerminal.waitFor({ state: 'detached' })

      const secondTerminal = await createPreferredHttpServiceTerminal(page, preferredPort)
      const secondEndpoint = await waitForActualServiceAddress(secondTerminal)
      const fallbackPort = Number(new URL(secondEndpoint).port)

      expect(secondEndpoint).not.toBe(firstEndpoint)
      expect(fallbackPort).not.toBe(preferredPort)
      expect(secondEndpoint).toBe(`http://127.0.0.1:${fallbackPort}`)
      await secondTerminal
        .getByText(`首选 ${preferredPort} 已占用，已改用 ${fallbackPort}`)
        .waitFor()

      const firstWorkspace = projectCard.getByRole('button', {
        name: /feature\/service-one.*独立工作区/
      })
      await firstWorkspace.click()
      await expect
        .poll(() => firstWorkspace.getAttribute('aria-current'), {
          interval: 50,
          timeout: 10_000
        })
        .toBe('page')
      await secondTerminal.waitFor({ state: 'detached' })

      await firstTerminal.waitFor()
      await expectActualServiceAddress(firstTerminal, firstEndpoint)
      expect(await firstTerminal.getByText(/首选 .*已占用，已改用/).count()).toBe(0)
    },
    electronScenarioTimeoutMs
  )

  it(
    'reuses a fixed port after the stopped worktree run settles while switching workspaces',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()

      const fixedPort = await findAvailableLoopbackPort()
      const projectCard = page.getByRole('group', {
        name: `项目 ${basename(workbench.projectDirectory)}`
      })
      const mainTerminal = await createHttpServiceTerminal(page, fixedPort, 'fixed', false)

      await createBranchWorkspace(projectCard, 'feature/service-stop')
      await mainTerminal.waitFor({ state: 'detached' })
      const branchTerminal = await createHttpServiceTerminal(page, fixedPort, 'fixed', true)
      await expectActualServiceAddress(branchTerminal, `http://127.0.0.1:${fixedPort}`)

      const mainWorkspace = projectCard.getByRole('button', {
        name: '切换到默认工作区 main'
      })
      await mainWorkspace.click()
      await expect
        .poll(() => mainWorkspace.getAttribute('aria-current'), { interval: 50, timeout: 10_000 })
        .toBe('page')
      await branchTerminal.waitFor({ state: 'detached' })

      await launchConfiguredTerminal(page, mainTerminal)
      await page.getByText('启动命令失败', { exact: true }).waitFor()
      await page.getByRole('button', { name: '关闭“启动命令失败”通知' }).click()

      const branchWorkspace = projectCard.getByRole('button', {
        name: /feature\/service-stop.*独立工作区/
      })
      await branchWorkspace.click()
      await expect
        .poll(() => branchWorkspace.getAttribute('aria-current'), {
          interval: 50,
          timeout: 10_000
        })
        .toBe('page')
      await mainTerminal.waitFor({ state: 'detached' })

      const stopAction = branchTerminal.getByRole('button', {
        name: 'Terminal 1 停止当前命令'
      })
      await stopAction.click()
      await expect.poll(() => stopAction.isDisabled(), { interval: 50, timeout: 10_000 }).toBe(true)
      await expect
        .poll(() => branchTerminal.getByLabel('实际服务地址', { exact: true }).count(), {
          interval: 50,
          timeout: 10_000
        })
        .toBe(0)

      await mainWorkspace.click()
      await expect
        .poll(() => mainWorkspace.getAttribute('aria-current'), { interval: 50, timeout: 10_000 })
        .toBe('page')
      await branchTerminal.waitFor({ state: 'detached' })

      await launchConfiguredTerminal(page, mainTerminal)
      await expectActualServiceAddress(mainTerminal, `http://127.0.0.1:${fixedPort}`)
      expect(await page.getByText('启动命令失败', { exact: true }).count()).toBe(0)
    },
    electronScenarioTimeoutMs
  )
})

async function createBranchWorkspace(projectCard: Locator, branchName: string): Promise<void> {
  await projectCard.getByRole('button', { name: '新建分支工作区' }).click()
  await projectCard.getByLabel('分支名称').fill(branchName)
  await projectCard.getByRole('button', { name: '创建 Worktree' }).click()
  const workspace = projectCard.getByRole('button', {
    name: new RegExp(`${escapeRegExp(branchName)}.*独立工作区`)
  })
  await workspace.waitFor()
  await expect
    .poll(() => workspace.getAttribute('aria-current'), { interval: 50, timeout: 10_000 })
    .toBe('page')
}

async function createPreferredHttpServiceTerminal(
  page: Page,
  preferredPort: number
): Promise<Locator> {
  return createHttpServiceTerminal(page, preferredPort, 'preferred', true)
}

async function createHttpServiceTerminal(
  page: Page,
  port: number,
  policy: 'fixed' | 'preferred',
  shouldStart: boolean
): Promise<Locator> {
  await page.getByRole('button', { name: '新建终端积木' }).click()
  const currentTerminal = terminalBlock(page)
  await currentTerminal.waitFor()
  const terminalBlockId = await currentTerminal.getAttribute('data-terminal-block-id')

  if (!terminalBlockId) {
    throw new Error('The service terminal did not expose its stable block identity.')
  }

  const terminal = page.locator(`[data-terminal-block-id="${terminalBlockId}"]`)
  await terminal.getByRole('button', { name: 'Terminal 1 编辑终端信息' }).click()
  await terminal
    .getByRole('textbox', { name: '启动命令' })
    .fill(createE2eNodeScriptCommand('service-fixture.mjs', [], { replaceShell: true }))
  await terminal.getByText('工作流高级配置', { exact: true }).click()
  await terminal.getByLabel('运行模式').selectOption('service')
  await terminal.getByLabel('服务就绪方式').selectOption('tcp')
  await terminal.getByLabel('端口策略').selectOption(policy)
  await terminal.getByLabel('访问协议').selectOption('http')
  await terminal.getByRole('textbox', { name: '服务端口' }).fill(String(port))
  await terminal.getByLabel('端口注入方式').selectOption('environment')
  await terminal.getByRole('textbox', { name: '环境变量名称' }).fill('PORT')
  await terminal.getByRole('button', { name: '保存终端信息' }).click()
  await terminal.getByRole('form', { name: '编辑终端信息' }).waitFor({ state: 'detached' })

  if (shouldStart) await launchConfiguredTerminal(page, terminal)

  return terminal
}

async function launchConfiguredTerminal(page: Page, terminal: Locator): Promise<void> {
  const previousSessionId = await readTerminalSessionId(page, 'Terminal 1')
  await terminal.getByRole('button', { name: 'Terminal 1 启动命令' }).click()
  await page.waitForFunction(
    ({ previousSessionId }) => {
      const currentSessionId = document
        .querySelector('[aria-label="Terminal 1 文本输出"]')
        ?.getAttribute('data-terminal-session-id')

      return Boolean(currentSessionId && currentSessionId !== previousSessionId)
    },
    { previousSessionId }
  )
}

function terminalBlock(page: Page): Locator {
  return page.locator('[data-terminal-block-id]').filter({ hasText: 'Terminal 1' })
}

async function waitForActualServiceAddress(terminal: Locator): Promise<string> {
  const address = terminal.getByLabel('实际服务地址', { exact: true })
  await address.waitFor()

  return (await address.textContent())?.trim() ?? ''
}

async function expectActualServiceAddress(
  terminal: Locator,
  expectedAddress: string
): Promise<void> {
  const address = terminal.getByLabel('实际服务地址', { exact: true })

  await expect
    .poll(async () => (await address.textContent())?.trim() ?? '', {
      interval: 50,
      timeout: 10_000
    })
    .toBe(expectedAddress)
}

async function initializeGitProjectWithHttpService(directory: string): Promise<void> {
  await execGit(directory, ['init', '--initial-branch=main'])
  await execGit(directory, ['config', 'user.email', 'test@example.com'])
  await execGit(directory, ['config', 'user.name', 'Test User'])
  await writeFile(join(directory, 'README.md'), 'service port e2e fixture\n', 'utf8')
  await writeFile(join(directory, 'service-fixture.mjs'), httpServiceFixtureSource, 'utf8')
  await execGit(directory, ['add', 'README.md', 'service-fixture.mjs'])
  await execGit(directory, ['commit', '-m', 'initial service fixture'])
}

async function findAvailableLoopbackPort(): Promise<number> {
  const server = createServer()

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, resolve)
  })

  const address = server.address()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )

  if (!address || typeof address === 'string') {
    throw new Error('The E2E port probe did not return a TCP address.')
  }

  return address.port
}

function execGit(directory: string, args: readonly string[]) {
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

function projectWorktreesDirectory(projectDirectory: string): string {
  return join(dirname(projectDirectory), 'worktrees', basename(projectDirectory))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const httpServiceFixtureSource = `
import { createServer } from 'node:http'

const port = Number(process.env.PORT)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port')
}

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' })
  response.end('cleancode service port e2e')
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(\`CLEANCODE_E2E_HTTP_READY:\${port}\\n\`)
})

let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  server.closeAllConnections?.()
  server.close(() => process.exit(0))
}

process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdin.on('data', (data) => {
  if (data.includes(3)) stop()
})
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
`
