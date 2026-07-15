// @vitest-environment node

import { join } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'

import {
  waitForMouseReports,
  writeFakeAgentScript,
  writeMouseReporterScript,
  writeQuickLaunchFixtureScript,
  writeTerminalSelectionFixtureScript
} from '../fixtures/contexts/run/fakeTerminalPrograms'
import {
  captureE2eFailureDiagnostics,
  closeElectronApp,
  cleanupE2eWorkbench,
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readOnlyJsonFile,
  waitForTextFile,
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
import {
  readCanvasViewportTransform,
  readXtermAsciiCellCenter,
  readXtermSelection,
  selectExactXtermText,
  setCanvasZoomFromDefault
} from '../support/terminalSelectionE2e'
import {
  configureAndStartTerminalLaunchCommand,
  e2eShellReadyMarker,
  readTerminalSessionId,
  waitForTerminalOutput,
  waitForTerminalShellReady,
  writeTerminalCommand
} from '../support/e2eTerminal'

describe('run terminal sessions e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page

  beforeEach(async () => {
    workbench = await createE2eWorkbench('cleancode-run-terminal-e2e')
    electronApp = await launchApp(workbench, {
      environment: { PS1: `${e2eShellReadyMarker} `, SHELL: '/bin/sh' }
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async ({ task }) => {
    try {
      if (task.result?.state === 'fail') {
        await captureE2eFailureDiagnostics({ electronApp, page, taskName: task.name, workbench })
      }
    } finally {
      try {
        await closeElectronApp(electronApp)
      } finally {
        await cleanupE2eWorkbench(workbench)
      }
    }
  })

  it(
    'runs shell commands from the active project workspace',
    async () => {
      await createRunningTerminal(page)
      const commandOutputPath = join(workbench.projectDirectory, 'terminal-command-output.txt')
      const workingDirectoryOutputPath = join(
        workbench.projectDirectory,
        'terminal-working-directory.txt'
      )

      await writeTerminalCommand(
        page,
        'Terminal 1',
        'printf cleancode-e2e-ok > terminal-command-output.txt; pwd > terminal-working-directory.txt\r'
      )

      expect(await waitForTextFile(commandOutputPath)).toBe('cleancode-e2e-ok')
      expect((await waitForTextFile(workingDirectoryOutputPath)).trim()).toBe(
        workbench.projectDirectory
      )

      const graph = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ type: string }>
      }

      expect(graph.blocks).toHaveLength(1)
      expect(graph.blocks[0]?.type).toBe('terminal')
    },
    electronScenarioTimeoutMs
  )

  it(
    'selects exact terminal text on a zoomed canvas without moving the node',
    async () => {
      await createRunningTerminal(page)
      const controlText = 'cleancode-selection-control'
      const copiedText = 'cleancode-terminal-selection'
      const outputLine = `left-guard-${copiedText}-right-guard`
      const terminal = page.locator('[data-terminal-block-id] .terminal-viewport')
      const selectionFixturePath = await writeTerminalSelectionFixtureScript(
        workbench.projectDirectory,
        { controlText, outputLine }
      )

      await configureAndStartTerminalLaunchCommand(
        page,
        'Terminal 1',
        `node ${JSON.stringify(selectionFixturePath)}`
      )
      await waitForTerminalOutput(page, 'Terminal 1', controlText)
      await selectExactXtermText(page, terminal, controlText)
      expect(await readXtermSelection(terminal)).toBe(controlText)
      await waitForTerminalOutput(page, 'Terminal 1', outputLine)
      const zoom = await setCanvasZoomFromDefault(page, 'out')

      const originalClipboard = await electronApp.evaluate(({ clipboard }) => clipboard.readText())

      try {
        await electronApp.evaluate(({ clipboard }) => clipboard.clear())
        const beforePosition = await readTerminalBlockPosition(workbench)
        const beforeViewport = await readCanvasViewportTransform(page)

        await selectExactXtermText(page, terminal, copiedText)

        expect(zoom).toBeLessThan(1)
        expect(await readXtermSelection(terminal)).toBe(copiedText)
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C')

        const clipboardText = await electronApp.evaluate(({ clipboard }) => clipboard.readText())
        const afterPosition = await readTerminalBlockPosition(workbench)

        expect(clipboardText).toBe(copiedText)
        expect(afterPosition).toEqual(beforePosition)
        expect(await readCanvasViewportTransform(page)).toBe(beforeViewport)
      } finally {
        await electronApp.evaluate(
          ({ clipboard }, text) => clipboard.writeText(text),
          originalClipboard
        )
      }
    },
    electronScenarioTimeoutMs
  )

  it(
    'configures and starts one launch command from a terminal block',
    async () => {
      await createRunningTerminal(page)

      const launchOutput = 'quick-launch-e2e-once'
      const { reportPath, scriptPath } = await writeQuickLaunchFixtureScript(
        workbench.projectDirectory,
        launchOutput
      )
      const launchCommand = `node ${JSON.stringify(scriptPath)} ${JSON.stringify(reportPath)}`

      await configureAndStartTerminalLaunchCommand(page, 'Terminal 1', launchCommand)
      await waitForTerminalOutput(page, 'Terminal 1', launchOutput)

      const graph = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ launchCommand: string }>
      }

      expect(graph.blocks[0]?.launchCommand).toBe(launchCommand)
      expect(await waitForTextFile(reportPath)).toBe(`${launchOutput}\n`)
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

      const fakeAgentScriptPath = await writeFakeAgentScript(workbench.projectDirectory)

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
      await waitForTerminalShellReady(page, 'Terminal 2')

      const fakeAgentScriptPath = await writeFakeAgentScript(workbench.projectDirectory)

      await writeTerminalCommand(
        page,
        'Terminal 1',
        `node ${JSON.stringify(fakeAgentScriptPath)}\r`
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'FAKE_AGENT_READY')
      await page.locator('[data-terminal-block-id]').nth(1).locator('.terminal-viewport').click()
      await page.keyboard.type('printf second-terminal-focus-ok', { delay: 10 })
      await page.keyboard.press('Enter')

      await waitForTerminalOutput(page, 'Terminal 2', 'second-terminal-focus-ok')
    },
    electronScenarioTimeoutMs
  )

  it(
    'reports exact TUI mouse cells on a zoomed canvas without moving the node',
    async () => {
      await createRunningTerminal(page)
      const { reportPath, scriptPath } = await writeMouseReporterScript(workbench.projectDirectory)

      await writeTerminalCommand(
        page,
        'Terminal 1',
        `node ${JSON.stringify(scriptPath)} ${JSON.stringify(reportPath)}\r`
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'MOUSE_REPORTER_READY')
      const zoom = await setCanvasZoomFromDefault(page, 'out')
      const terminal = page.locator('[data-terminal-block-id] .terminal-viewport')
      const beforePosition = await readTerminalBlockPosition(workbench)
      const beforeViewport = await readCanvasViewportTransform(page)
      const start = await readXtermAsciiCellCenter(terminal, { column: 12, rowMarker: 'ROW_3-' })
      const end = await readXtermAsciiCellCenter(terminal, { column: 24, rowMarker: 'ROW_6-' })

      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      await page.mouse.move(end.x, end.y, { steps: 12 })
      await page.mouse.up()
      const reports = await waitForMouseReports(reportPath, ['down', 'move', 'up'])

      expect(zoom).toBeLessThan(1)
      expect(reports.find((report) => report.kind === 'down')).toMatchObject({
        column: 12,
        row: start.row
      })
      expect(reports.filter((report) => report.kind === 'move').at(-1)).toMatchObject({
        column: 24,
        row: end.row
      })
      expect(reports.find((report) => report.kind === 'up')).toMatchObject({
        column: 24,
        row: end.row
      })
      expect(await readTerminalBlockPosition(workbench)).toEqual(beforePosition)
      expect(await readCanvasViewportTransform(page)).toBe(beforeViewport)
      await writeTerminalCommand(page, 'Terminal 1', '\u0003')
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
  await waitForTerminalShellReady(page, 'Terminal 1')
  await page.waitForFunction(() =>
    document.activeElement?.classList.contains('xterm-helper-textarea')
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
