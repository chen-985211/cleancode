// @vitest-environment node

import { join } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'

import {
  readFakeAgentReports,
  waitForMouseReports,
  writeFakeAgentScript,
  writeMouseReporterScript,
  writeTerminalSelectionFixtureScript,
  type FakeAgentReport
} from '../fixtures/contexts/run/fakeTerminalPrograms'
import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  selectBlankCanvasAction,
  teardownE2eScenario,
  waitForTextFile,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { readE2eBlockGraph } from '../support/e2eBlockGraph'
import { pollUntilState } from '../support/e2ePolling'
import {
  readRequiredBoundingBox,
  readTerminalBlockPosition,
  readTerminalBlockSize,
  resizeTerminalBlockFromBottomRight,
  startTerminalBlockResizeFromBottomRight,
  waitForTerminalBlockPositionChange,
  waitForTerminalBlockSizeChange
} from '../support/terminalResizeE2e'
import {
  readCanvasViewportTransform,
  readXtermAsciiCellCenter,
  readXtermSelection,
  selectExactXtermText,
  setCanvasZoomFromDefault
} from '../support/terminalSelectionE2e'
import {
  asE2eTerminalInput,
  configureAndStartTerminalLaunchCommand,
  createE2eNodeCommand,
  createE2eNodeScriptCommand,
  createE2ePrintCommand,
  createE2eStreamingCommand,
  createE2eTerminalEnvironment,
  readTerminalSessionId,
  waitForTerminalOutput,
  waitForTerminalShellReady,
  writeTerminalCommand
} from '../support/e2eTerminal'

describe('run terminal sessions e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-run-terminal-e2e')
    resources.workbench = workbench
    electronApp = await launchApp(workbench, {
      environment: createE2eTerminalEnvironment()
    })
    resources.electronApp = electronApp
    page = await electronApp.firstWindow()
    resources.page = page
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  })

  it(
    'runs shell commands from the active project workspace',
    { tags: 'smoke', timeout: electronScenarioTimeoutMs },
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
        asE2eTerminalInput(
          createE2eNodeCommand(
            [
              "const { writeFileSync } = require('node:fs')",
              "writeFileSync('terminal-command-output.txt', 'cleancode-e2e-ok')",
              "writeFileSync('terminal-working-directory.txt', process.cwd())"
            ].join(';')
          )
        )
      )

      expect(await waitForTextFile(commandOutputPath)).toBe('cleancode-e2e-ok')
      expect((await waitForTextFile(workingDirectoryOutputPath)).trim()).toBe(
        workbench.projectDirectory
      )

      const graph = await readE2eBlockGraph(workbench)

      expect(graph.blocks).toHaveLength(1)
      expect(graph.blocks[0]?.type).toBe('terminal')
    }
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
        createE2eNodeScriptCommand(selectionFixturePath)
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
    'keeps a dragged terminal block under the pointer while output is streaming',
    async () => {
      await createRunningTerminal(page)
      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(createE2eStreamingCommand('streaming-output', 20))
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

      await resizeTerminalBlockFromBottomRight(page, 140, 100)

      const afterSize = await waitForTerminalBlockSizeChange(workbench, beforeSize)
      const afterBox = await readRequiredBoundingBox(terminalBlock)

      expect(afterSize.width - beforeSize.width).toBeGreaterThan(100)
      expect(afterSize.height - beforeSize.height).toBeGreaterThan(70)
      expect(afterBox.width - beforeBox.width).toBeGreaterThan(100)
      expect(afterBox.height - beforeBox.height).toBeGreaterThan(70)
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

      await page.mouse.move(resizeDrag.startX + 140, resizeDrag.startY + 100, { steps: 18 })

      const duringBox = await pollUntilState({
        description: 'terminal resize preview before pointer release',
        observe: () => readRequiredBoundingBox(terminalBlock),
        accept: (box) => box.width - beforeBox.width > 100 && box.height - beforeBox.height > 70,
        timeoutMs: 5_000
      })

      await page.mouse.up()

      expect(duringBox.width - beforeBox.width).toBeGreaterThan(100)
      expect(duringBox.height - beforeBox.height).toBeGreaterThan(70)
    },
    electronScenarioTimeoutMs
  )

  it(
    'resizes a terminal running a fullscreen agent only after the resize drag settles',
    async () => {
      await createRunningTerminal(page)

      const fakeAgent = await writeFakeAgentScript(workbench.projectDirectory)

      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(createE2eNodeScriptCommand(fakeAgent.scriptPath))
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'FAKE_AGENT_READY')
      const started = await waitForFakeAgentReport(
        fakeAgent.reportPath,
        (report) => report.kind === 'start',
        'the fullscreen fixture to report its initial terminal size'
      )
      const beforeResizeReports = await readFakeAgentReports(fakeAgent.reportPath)
      const beforeResizeState = beforeResizeReports.at(-1) ?? started
      const terminalBlock = page.locator('[data-terminal-block-id]').first()
      const beforeBox = await readRequiredBoundingBox(terminalBlock)

      await resizeTerminalBlockFromBottomRight(page, 140, 100)
      const afterMouseUpBox = await readRequiredBoundingBox(terminalBlock)

      const resized = await waitForFakeAgentReport(
        fakeAgent.reportPath,
        (report) =>
          report.kind === 'resize' &&
          report.resizeCount > beforeResizeState.resizeCount &&
          report.columns > beforeResizeState.columns &&
          report.rows > beforeResizeState.rows,
        'SIGWINCH with the enlarged terminal dimensions'
      )
      await writeTerminalCommand(page, 'Terminal 1', '\u0003')
      await waitForFakeAgentReport(
        fakeAgent.reportPath,
        (report) => report.kind === 'exit' && report.resizeCount >= resized.resizeCount,
        'the fullscreen fixture to exit after Ctrl-C'
      )
      const resizeReports = (await readFakeAgentReports(fakeAgent.reportPath)).filter(
        (report) => report.kind === 'resize' && report.resizeCount > beforeResizeState.resizeCount
      )

      expect(resizeReports.length).toBeGreaterThan(0)
      expect(resizeReports.length).toBeLessThanOrEqual(2)
      expect(afterMouseUpBox.width - beforeBox.width).toBeGreaterThan(100)
      expect(afterMouseUpBox.height - beforeBox.height).toBeGreaterThan(70)
      expect(resized.columns).toBeGreaterThan(beforeResizeState.columns)
      expect(resized.rows).toBeGreaterThan(beforeResizeState.rows)
    },
    electronScenarioTimeoutMs
  )

  it(
    'allows another terminal to receive keyboard input while a fullscreen agent is running',
    async () => {
      await createRunningTerminal(page)
      await selectBlankCanvasAction(page, '新建终端积木')
      await readTerminalSessionId(page, 'Terminal 2')
      await waitForTerminalShellReady(page, 'Terminal 2')

      const fakeAgent = await writeFakeAgentScript(workbench.projectDirectory)

      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(createE2eNodeScriptCommand(fakeAgent.scriptPath))
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'FAKE_AGENT_READY')
      await page.locator('[data-terminal-block-id]').nth(1).locator('.terminal-viewport').click()
      await page.keyboard.type(createE2ePrintCommand('second-terminal-focus-ok'), { delay: 10 })
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
        asE2eTerminalInput(createE2eNodeScriptCommand(scriptPath, [reportPath]))
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

async function waitForFakeAgentReport(
  reportPath: string,
  predicate: (report: FakeAgentReport) => boolean,
  description: string
): Promise<FakeAgentReport> {
  const reports = await pollUntilState({
    description,
    observe: () => readFakeAgentReports(reportPath),
    accept: (observations) => observations.some(predicate),
    timeoutMs: 5_000
  })
  const report = reports.find(predicate)

  if (!report) throw new Error(`The completed ${description} observation was unavailable.`)
  return report
}

async function createRunningTerminal(page: Page): Promise<void> {
  await expectDesktopRuntime(page)
  await page.getByRole('button', { name: '添加项目' }).click()
  await selectBlankCanvasAction(page, '新建终端积木')
  await readTerminalSessionId(page, 'Terminal 1')
  await waitForTerminalShellReady(page, 'Terminal 1')
  const terminalBlock = page.locator('[data-terminal-block-id]').first()
  await pollUntilState({
    description: 'terminal creation motion to settle',
    observe: () =>
      terminalBlock.evaluate(
        (element) => !element.classList.contains('workbench-object-motion--create')
      ),
    accept: Boolean,
    timeoutMs: 5_000
  })
  const terminalInput = page.getByLabel('Terminal input')
  await terminalInput.focus()
  await pollUntilState({
    description: 'terminal input to receive focus',
    observe: () => terminalInput.evaluate((element) => element === document.activeElement),
    accept: Boolean,
    timeoutMs: 5_000
  })
}
