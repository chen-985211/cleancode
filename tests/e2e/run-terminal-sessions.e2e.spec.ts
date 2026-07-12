// @vitest-environment node

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'

import {
  buildElectronApp,
  cleanupE2eWorkbench,
  createE2eWorkbench,
  electronBuildTimeoutMs,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readOnlyJsonFile,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import {
  readRequiredBoundingBox,
  readTerminalBlockPosition,
  readTerminalBlockSize,
  resizeTerminalBlockFromBottomRight,
  startTerminalBlockResizeFromBottomRight,
  startTerminalBlockResizeFromTopLeft,
  waitForTerminalBlockPositionChange,
  waitForTerminalBlockSizeChange,
  waitForTerminalSelectionState
} from '../support/terminalResizeE2e'

describe('run terminal sessions e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page

  beforeAll(async () => {
    await buildElectronApp()
  }, electronBuildTimeoutMs)

  beforeEach(async () => {
    workbench = await createE2eWorkbench('cleancode-run-terminal-e2e')
    electronApp = await launchApp(workbench)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async () => {
    await electronApp.close()
    await cleanupE2eWorkbench(workbench)
  })

  it(
    'runs shell commands from the active project workspace',
    async () => {
      await createRunningTerminal(page)

      await writeTerminalCommand(page, 'Terminal 1', 'printf cleancode-e2e-ok\r')
      await waitForTerminalOutput(page, 'Terminal 1', 'cleancode-e2e-ok')
      await writeTerminalCommand(page, 'Terminal 1', 'pwd\r')
      await waitForTerminalOutput(page, 'Terminal 1', workbench.projectDirectory)

      const graph = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ type: string }>
      }
      const terminalOutput = await page.getByLabel('Terminal 1 文本输出').textContent()

      expect(graph.blocks).toHaveLength(1)
      expect(graph.blocks[0]?.type).toBe('terminal')
      expect(terminalOutput).toContain('cleancode-e2e-ok')
      expect(terminalOutput).toContain(workbench.projectDirectory)
    },
    electronScenarioTimeoutMs
  )

  it(
    'configures and starts one launch command from a terminal block',
    async () => {
      await createRunningTerminal(page)

      const launchOutput = 'quick-launch-e2e-once'
      const launchCommand =
        'printf "\\x71\\x75\\x69\\x63\\x6b\\x2d\\x6c\\x61\\x75\\x6e\\x63\\x68\\x2d\\x65\\x32\\x65\\x2d\\x6f\\x6e\\x63\\x65"'

      await page.getByRole('button', { name: 'Terminal 1 启动命令' }).click()
      const launchCommandInput = page.getByRole('textbox', { name: '启动命令' })

      await launchCommandInput.fill(launchCommand)
      await launchCommandInput.press('Enter')
      await waitForQuickLaunchState(page, 'configured')
      await page.getByRole('button', { name: 'Terminal 1 启动命令' }).click()
      await waitForTerminalOutput(page, 'Terminal 1', launchOutput)

      const graph = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ launchCommand: string }>
      }
      const terminalOutput = await page.getByLabel('Terminal 1 文本输出').textContent()

      expect(graph.blocks[0]?.launchCommand).toBe(launchCommand)
      expect(countOccurrences(terminalOutput ?? '', launchOutput)).toBe(1)
    },
    electronScenarioTimeoutMs
  )

  it(
    'keeps a dragged terminal block under the pointer while output is streaming',
    async () => {
      await createRunningTerminal(page)
      await writeTerminalCommand(
        page,
        'Terminal 1',
        'while :; do printf streaming-output; sleep 0.02; done\r'
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'streaming-output')

      const terminalBlock = page.locator('[data-terminal-block-id]').first()
      const beforeDragPosition = await readTerminalBlockPosition(workbench)
      const terminalHeader = terminalBlock.locator('.terminal-node__header')
      const headerBox = await readRequiredBoundingBox(terminalHeader)

      await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(
        headerBox.x + headerBox.width / 2 + 220,
        headerBox.y + headerBox.height / 2 + 140,
        { steps: 18 }
      )
      await page.mouse.up()
      await writeTerminalCommand(page, 'Terminal 1', '\u0003')

      const afterDragPosition = await waitForTerminalBlockPositionChange(
        workbench,
        beforeDragPosition
      )

      expect(afterDragPosition.x - beforeDragPosition.x).toBeGreaterThan(160)
      expect(afterDragPosition.y - beforeDragPosition.y).toBeGreaterThan(90)
    },
    electronScenarioTimeoutMs
  )

  it(
    'persists and displays a terminal block resize',
    async () => {
      await createRunningTerminal(page)

      const terminalBlock = page.locator('[data-terminal-block-id]').first()
      const beforeBox = await readRequiredBoundingBox(terminalBlock)
      const beforeSize = await readTerminalBlockSize(workbench)

      await resizeTerminalBlockFromBottomRight(page, 180, 120)

      const afterSize = await waitForTerminalBlockSizeChange(workbench, beforeSize)
      const afterBox = await readRequiredBoundingBox(terminalBlock)

      expect(afterSize.width - beforeSize.width).toBeGreaterThan(120)
      expect(afterSize.height - beforeSize.height).toBeGreaterThan(80)
      expect(afterBox.width - beforeBox.width).toBeGreaterThan(120)
      expect(afterBox.height - beforeBox.height).toBeGreaterThan(80)
    },
    electronScenarioTimeoutMs
  )

  it(
    'selects a terminal only from its title and resizes its unselected top-left corner',
    async () => {
      await createRunningTerminal(page)

      const terminalBlock = page.locator('[data-terminal-block-id]').first()
      const agentHeader = page.locator('.agent-console__header').first()
      await agentHeader.click()
      await waitForTerminalSelectionState(page, false)

      await terminalBlock.locator('.terminal-frame').click()
      await waitForTerminalSelectionState(page, false)
      await terminalBlock.locator('.terminal-node__header').click()
      await waitForTerminalSelectionState(page, true)
      await agentHeader.click()
      await waitForTerminalSelectionState(page, false)

      const beforeBox = await readRequiredBoundingBox(terminalBlock)
      const beforePosition = await readTerminalBlockPosition(workbench)
      const beforeSize = await readTerminalBlockSize(workbench)
      const resizeDrag = await startTerminalBlockResizeFromTopLeft(page)

      await page.mouse.move(resizeDrag.startX - 100, resizeDrag.startY - 80, { steps: 18 })
      await page.mouse.up()

      const afterPosition = await waitForTerminalBlockPositionChange(workbench, beforePosition)
      const afterSize = await waitForTerminalBlockSizeChange(workbench, beforeSize)
      const afterBox = await readRequiredBoundingBox(terminalBlock)

      expect(afterPosition.x).toBeLessThan(beforePosition.x - 60)
      expect(afterPosition.y).toBeLessThan(beforePosition.y - 45)
      expect(afterSize.width).toBeGreaterThan(beforeSize.width + 60)
      expect(afterSize.height).toBeGreaterThan(beforeSize.height + 45)
      expect(
        Math.abs(afterPosition.x + afterSize.width - (beforePosition.x + beforeSize.width))
      ).toBeLessThan(2)
      expect(
        Math.abs(afterPosition.y + afterSize.height - (beforePosition.y + beforeSize.height))
      ).toBeLessThan(2)
      expect(afterBox.width).toBeGreaterThan(beforeBox.width + 60)
      expect(afterBox.height).toBeGreaterThan(beforeBox.height + 45)
    },
    electronScenarioTimeoutMs
  )

  it(
    'shows terminal block resize feedback before the pointer is released',
    async () => {
      await createRunningTerminal(page)

      const terminalBlock = page.locator('[data-terminal-block-id]').first()
      const beforeBox = await readRequiredBoundingBox(terminalBlock)
      const resizeDrag = await startTerminalBlockResizeFromBottomRight(page)

      await page.mouse.move(resizeDrag.startX + 180, resizeDrag.startY + 120, { steps: 18 })

      const duringBox = await readRequiredBoundingBox(terminalBlock)

      await page.mouse.up()

      expect(duringBox.width - beforeBox.width).toBeGreaterThan(120)
      expect(duringBox.height - beforeBox.height).toBeGreaterThan(80)
    },
    electronScenarioTimeoutMs
  )

  it(
    'resizes a terminal running a fullscreen agent only after the resize drag settles',
    async () => {
      await createRunningTerminal(page)

      const fakeAgentScriptPath = await writeFakeAgentScript(workbench)

      await writeTerminalCommand(
        page,
        'Terminal 1',
        `node ${JSON.stringify(fakeAgentScriptPath)}\r`
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'FAKE_AGENT_READY')
      const terminalBlock = page.locator('[data-terminal-block-id]').first()
      const beforeBox = await readRequiredBoundingBox(terminalBlock)

      await resizeTerminalBlockFromBottomRight(page, 180, 120)
      const afterMouseUpBox = await readRequiredBoundingBox(terminalBlock)

      await page.waitForTimeout(300)
      await writeTerminalCommand(page, 'Terminal 1', '\u0003')

      const terminalOutput = (await page.getByLabel('Terminal 1 文本输出').textContent()) ?? ''
      const agentSizes = readFakeAgentSizes(terminalOutput)
      const initialTerminalSize = agentSizes[0]!
      const resizedTerminalSize = agentSizes.at(-1)!

      expect(countOccurrences(terminalOutput, 'SIGWINCH:')).toBeLessThanOrEqual(2)
      expect(afterMouseUpBox.width - beforeBox.width).toBeGreaterThan(120)
      expect(afterMouseUpBox.height - beforeBox.height).toBeGreaterThan(80)
      expect(resizedTerminalSize.columns).toBeGreaterThan(initialTerminalSize.columns)
      expect(resizedTerminalSize.rows).toBeGreaterThan(initialTerminalSize.rows)
    },
    electronScenarioTimeoutMs
  )

  it(
    'allows another terminal to receive keyboard input while a fullscreen agent is running',
    async () => {
      await createRunningTerminal(page)
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await readTerminalSessionId(page, 'Terminal 2')

      const fakeAgentScriptPath = await writeFakeAgentScript(workbench)

      await writeTerminalCommand(
        page,
        'Terminal 1',
        `node ${JSON.stringify(fakeAgentScriptPath)}\r`
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'FAKE_AGENT_READY')
      await page.locator('[data-terminal-block-id]').nth(1).locator('.terminal-viewport').click()
      await page.keyboard.type('printf second-terminal-focus-ok')
      await page.keyboard.press('Enter')

      await waitForTerminalOutput(page, 'Terminal 2', 'second-terminal-focus-ok')
    },
    electronScenarioTimeoutMs
  )
})

async function createRunningTerminal(page: Page): Promise<void> {
  await expectDesktopRuntime(page)
  await page.getByRole('button', { name: '添加项目' }).click()
  await page.getByRole('button', { name: '新建终端积木' }).click()
  await page.getByText('运行中').waitFor()
  await readTerminalSessionId(page, 'Terminal 1')
}

async function writeTerminalCommand(
  page: Page,
  terminalName: string,
  input: string
): Promise<void> {
  const sessionId = await readTerminalSessionId(page, terminalName)

  await page.evaluate(
    ({ targetSessionId, input }) =>
      window.cleancode?.writeTerminal({ sessionId: targetSessionId, input }),
    { targetSessionId: sessionId, input }
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

async function waitForQuickLaunchState(
  page: Page,
  state: 'configured' | 'unconfigured'
): Promise<void> {
  await page.waitForFunction(
    (state) =>
      document
        .querySelector('[aria-label="Terminal 1 启动命令"]')
        ?.getAttribute('data-launch-command-state') === state,
    state
  )
}

async function waitForTerminalOutput(
  page: Page,
  terminalName: string,
  output: string
): Promise<void> {
  await page.waitForFunction(
    ({ terminalName, output }) =>
      document
        .querySelector(`[aria-label="${terminalName} 文本输出"]`)
        ?.textContent?.includes(output) ?? false,
    { terminalName, output }
  )
}

function countOccurrences(text: string, pattern: string): number {
  return text.split(pattern).length - 1
}

function readFakeAgentSizes(output: string) {
  const matches = [...output.matchAll(/SIZE:(\d+)x(\d+)/g)]

  expect(matches.length).toBeGreaterThan(0)

  return matches.map((match) => ({
    columns: Number(match[1]),
    rows: Number(match[2])
  }))
}

async function writeFakeAgentScript(workbench: E2eWorkbench): Promise<string> {
  const scriptPath = join(workbench.projectDirectory, 'fake-agent-tui.mjs')

  await writeFile(
    scriptPath,
    `
const CSI = '\\x1b['
let resizeCount = 0

function draw(label) {
  process.stdout.write(
    \`\${CSI}H\${CSI}2JFAKE_AGENT_READY\\n\${label}\\nSIZE:\${process.stdout.columns}x\${process.stdout.rows}\\n\`
  )
}

function cleanup() {
  process.stdout.write(\`\${CSI}?1006l\${CSI}?1002l\${CSI}?1000l\${CSI}?1049l\`)
  process.exit(0)
}

process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdout.write(\`\${CSI}?1049h\${CSI}?1000h\${CSI}?1002h\${CSI}?1006h\`)
draw('START')

process.stdout.on('resize', () => {
  resizeCount += 1
  draw(\`SIGWINCH:\${resizeCount}\`)
})

process.stdin.on('data', (data) => {
  if (data.includes(3)) {
    cleanup()
  }
})
`,
    'utf8'
  )

  return scriptPath
}
