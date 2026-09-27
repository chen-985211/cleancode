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
  selectBlankCanvasAction,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { pollUntilState } from '../support/e2ePolling'
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
    await page.emulateMedia({ reducedMotion: 'no-preference' })
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
      await waitForLocatorAttribute(
        firstWorkspace,
        'aria-current',
        'page',
        'first service workspace to become current'
      )
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
      await waitForLocatorAttribute(
        mainWorkspace,
        'aria-current',
        'page',
        'main workspace to become current'
      )
      await branchTerminal.waitFor({ state: 'detached' })

      await launchConfiguredTerminal(page, mainTerminal)
      await page.getByText('启动命令失败', { exact: true }).waitFor()
      await page.getByRole('button', { name: '关闭“启动命令失败”通知' }).click()

      const branchWorkspace = projectCard.getByRole('button', {
        name: /feature\/service-stop.*独立工作区/
      })
      await branchWorkspace.click()
      await waitForLocatorAttribute(
        branchWorkspace,
        'aria-current',
        'page',
        'service branch workspace to become current'
      )
      await mainTerminal.waitFor({ state: 'detached' })

      const stopAction = branchTerminal.getByRole('button', {
        name: 'Terminal 1 停止当前命令'
      })
      await stopAction.click()
      await waitForLocatorDisabled(stopAction, 'branch service stop action to settle')
      await branchTerminal
        .getByLabel('实际服务地址', { exact: true })
        .waitFor({ state: 'detached' })

      await mainWorkspace.click()
      await waitForLocatorAttribute(
        mainWorkspace,
        'aria-current',
        'page',
        'main workspace to become current after service stop'
      )
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
  await waitForLocatorAttribute(
    workspace,
    'aria-current',
    'page',
    `${branchName} workspace to become current`
  )
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
  await selectBlankCanvasAction(page, '新建终端积木')
  const currentTerminal = terminalBlock(page)
  await currentTerminal.waitFor()
  const terminalBlockId = await currentTerminal.getAttribute('data-terminal-block-id')

  if (!terminalBlockId) {
    throw new Error('The service terminal did not expose its stable block identity.')
  }

  const terminal = page.locator(`[data-terminal-block-id="${terminalBlockId}"]`)
  await pollUntilState({
    description: 'terminal creation motion to finish before dragging its header',
    observe: () =>
      terminal.evaluate(
        (node) =>
          !node.matches('.workbench-object-presence--pending, .workbench-object-motion--create') &&
          !node.querySelector('.workbench-object-motion--create')
      ),
    accept: Boolean,
    timeoutMs: 5_000
  })
  // Reproduce opening a full editor near the window bottom without zooming the canvas out.
  const canvasBounds = await page.locator('.react-flow').boundingBox()
  const header = terminal.locator('.terminal-node__header')
  const headerBounds = await header.boundingBox()
  if (!canvasBounds || !headerBounds) throw new Error('Missing terminal or canvas geometry.')
  const dragX = headerBounds.x + 100
  const dragY = headerBounds.y + headerBounds.height / 2
  const targetY = canvasBounds.y + canvasBounds.height - 200
  await page.mouse.move(dragX, dragY)
  await page.mouse.down()
  await page.mouse.move(dragX, targetY, { steps: 12 })
  await page.mouse.up()
  await pollUntilState({
    description: 'terminal header to reach the bottom-edge editing position',
    observe: () => header.boundingBox(),
    accept: (bounds) =>
      Boolean(
        bounds &&
        bounds.y > canvasBounds.y + canvasBounds.height - 280 &&
        bounds.y + bounds.height < canvasBounds.y + canvasBounds.height
      ),
    timeoutMs: 5_000
  })
  const viewportBefore = await page.locator('.react-flow__viewport').getAttribute('style')
  const motion = await terminal.evaluateHandle((node) => {
    const bounds = node.getBoundingClientRect()
    let entered = false
    let exited = false
    let fieldsMoved = false
    let terminalSizeStable = true
    let frame = 0
    const sample = () => {
      const current = node.getBoundingClientRect()
      terminalSizeStable &&=
        Math.abs(current.width - bounds.width) < 1 && Math.abs(current.height - bounds.height) < 1
      const surface = node.querySelector('.terminal-metadata-surface')
      if (surface) {
        const opacity = Number(getComputedStyle(surface).opacity)
        entered ||= opacity > 0 && opacity < 1
        exited ||= surface.getAttribute('data-surface-motion-state') === 'closing'
      }
      for (const fields of node.querySelectorAll('[data-terminal-fields-motion]')) {
        const opacity = Number(getComputedStyle(fields).opacity)
        fieldsMoved ||= opacity > 0 && opacity < 1 && fields.getBoundingClientRect().height > 0
      }
      frame = requestAnimationFrame(sample)
    }
    frame = requestAnimationFrame(sample)
    return {
      stop: () => {
        cancelAnimationFrame(frame)
        return { entered, exited, fieldsMoved, terminalSizeStable }
      }
    }
  })
  try {
    const editButton = terminal.getByRole('button', { name: 'Terminal 1 编辑终端信息' })
    await editButton.click()
    await terminal.getByRole('textbox', { name: '启动命令' }).fill('unsaved command')
    await expectExpandedMetadataForm(terminal)
    await page.screenshot({ path: join('test-results', 'terminal-edit-short-command.png') })
    await terminal.getByRole('button', { name: 'Terminal 1 取消编辑' }).click()
    expect(await editButton.getAttribute('aria-expanded')).toBe('false')
    expect(await terminal.getByRole('form').count()).toBe(0)
    await editButton.click()
    expect(await terminal.getByRole('textbox', { name: '启动命令' }).inputValue()).toBe('')
    await terminal
      .getByRole('textbox', { name: '启动命令' })
      .fill(createE2eNodeScriptCommand('service-fixture.mjs', [], { replaceShell: true }))
    async function chooseConfiguration(label: string, value: string): Promise<void> {
      await terminal.getByRole('button', { name: label, exact: true }).click()
      await page
        .getByRole('menu', { name: label, exact: true })
        .locator(`[data-choice-value="${value}"]`)
        .click()
    }
    await expectExpandedMetadataForm(terminal)
    await page.screenshot({ path: join('test-results', 'terminal-edit-task.png') })
    await terminal.getByRole('radio', { name: '服务', exact: true }).check()
    await terminal.getByLabel('服务就绪方式').waitFor()
    await chooseConfiguration('服务就绪方式', 'tcp')
    await chooseConfiguration('端口策略', policy)
    await terminal.getByRole('textbox', { name: '服务端口' }).waitFor()
    await chooseConfiguration('访问协议', 'http')
    await terminal.getByRole('textbox', { name: '服务端口' }).fill(String(port))
    await chooseConfiguration('端口注入方式', 'environment')
    const environmentVariable = terminal.getByRole('textbox', { name: '环境变量名称' })
    await environmentVariable.waitFor()
    await environmentVariable.fill('PORT')
    await expectExpandedMetadataForm(terminal)
    await pollUntilState({
      description: 'all terminal configuration menus to finish closing',
      observe: () => page.locator('.choice-select-menu').count(),
      accept: (count) => count === 0,
      timeoutMs: 5_000
    })
    await page.screenshot({ path: join('test-results', 'terminal-edit-service.png') })
    await terminal.getByRole('button', { name: '保存终端信息', exact: true }).click()
    await terminal.locator('.terminal-metadata-surface').waitFor({ state: 'detached' })
    expect(await motion.evaluate((recorder) => recorder.stop())).toEqual({
      entered: true,
      exited: true,
      fieldsMoved: true,
      terminalSizeStable: true
    })
    expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(viewportBefore)
  } finally {
    await motion.evaluate((recorder) => recorder.stop())
    await motion.dispose()
  }

  if (shouldStart) await launchConfiguredTerminal(page, terminal)

  return terminal
}

async function expectExpandedMetadataForm(terminal: Locator): Promise<void> {
  await pollUntilState({
    description: 'terminal metadata surface and field motion to settle',
    observe: () =>
      terminal.evaluate(
        (node) =>
          node
            .querySelector('.terminal-metadata-surface')
            ?.getAttribute('data-surface-motion-state') === 'open' &&
          [...node.querySelectorAll('[data-terminal-fields-motion]')].every(
            (fields) => fields.getAttribute('data-terminal-fields-motion') === 'open'
          )
      ),
    accept: Boolean,
    timeoutMs: 5_000
  })
  const layout = await terminal.evaluate((node) => {
    const form = node.querySelector('.terminal-metadata-form')
    const body = node.querySelector('.terminal-metadata-form__body')
    if (!(form instanceof HTMLElement) || !(body instanceof HTMLElement)) return null
    const bounds = form.getBoundingClientRect()
    const canvas = node.closest('.react-flow')!.getBoundingClientRect()
    const trigger = node.querySelector('.terminal-node__action--edit')!.getBoundingClientRect()
    const intersects = (other: DOMRect) =>
      bounds.left < other.right &&
      bounds.right > other.left &&
      bounds.top < other.bottom &&
      bounds.bottom > other.top
    const parameters = form.querySelectorAll('.terminal-execution-config__grid > label')
    const firstParameter = parameters[0]?.getBoundingClientRect()
    const secondParameter = parameters[1]?.getBoundingClientRect()
    return {
      hasInternalScroll: body.scrollHeight > body.clientHeight,
      insideCanvas:
        bounds.left >= canvas.left &&
        bounds.top >= canvas.top &&
        bounds.right <= canvas.right &&
        bounds.bottom <= canvas.bottom,
      toggleUncovered: !intersects(trigger),
      avoidsCanvasChrome: [
        ...document.querySelectorAll('[data-workbench-canvas-obstruction]')
      ].every((element) => !intersects(element.getBoundingClientRect())),
      parametersShareRow: Boolean(
        firstParameter &&
        secondParameter &&
        Math.abs(firstParameter.top - secondParameter.top) < 1 &&
        firstParameter.right < secondParameter.left
      ),
      actionsInsideForm: [
        '.terminal-metadata-form__header',
        '.terminal-metadata-form__footer'
      ].every((selector) => {
        const element = form.querySelector(selector)
        if (!element) return false
        const rect = element.getBoundingClientRect()
        return rect.top >= bounds.top && rect.bottom <= bounds.bottom
      })
    }
  })
  expect(layout).toEqual({
    hasInternalScroll: false,
    insideCanvas: true,
    toggleUncovered: true,
    avoidsCanvasChrome: true,
    parametersShareRow: true,
    actionsInsideForm: true
  })
}

async function launchConfiguredTerminal(page: Page, terminal: Locator): Promise<void> {
  const launchAction = terminal.getByRole('button', { name: 'Terminal 1 启动命令' })
  await waitForLocatorAttribute(
    launchAction,
    'data-launch-command-state',
    'configured',
    'service terminal launch command to become configured'
  )
  const previousSessionId = await readTerminalSessionId(page, 'Terminal 1')
  await launchAction.click()
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

  const actualAddress = await pollUntilState({
    description: `actual service address to become ${expectedAddress}`,
    observe: async () => (await address.textContent())?.trim() ?? '',
    accept: (currentAddress) => currentAddress === expectedAddress,
    intervalMs: 50,
    timeoutMs: 10_000
  })

  expect(actualAddress).toBe(expectedAddress)
}

async function waitForLocatorAttribute(
  locator: Locator,
  name: string,
  expectedValue: string,
  description: string
): Promise<void> {
  const value = await pollUntilState({
    description,
    observe: () => locator.getAttribute(name),
    accept: (currentValue) => currentValue === expectedValue,
    intervalMs: 50,
    timeoutMs: 10_000
  })

  expect(value).toBe(expectedValue)
}

async function waitForLocatorDisabled(locator: Locator, description: string): Promise<void> {
  await pollUntilState({
    description,
    observe: () => locator.isDisabled(),
    accept: Boolean,
    intervalMs: 50,
    timeoutMs: 10_000
  })
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
