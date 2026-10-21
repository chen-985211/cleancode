// @vitest-environment node

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'

import {
  installFakeCodexCli,
  readFakeCodexCliReports
} from '../fixtures/contexts/agent/fakeCodexCli'
import {
  createE2eWorkbench,
  electronScenarioTimeoutMs,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources
} from '../support/e2eWorkbench'
import { pollUntilState } from '../support/e2ePolling'
import { readWebgl2Availability, readXtermInkRatio } from '../support/terminalRasterE2e'
import {
  createE2eTerminalEnvironment,
  createE2ePrintCommand,
  prependE2ePath,
  readTerminalSessionId,
  waitForTerminalShellReady,
  waitForTerminalOutput,
  writeTerminalCommand,
  asE2eTerminalInput
} from '../support/e2eTerminal'

// Real renderer/PTY boundary: disclosure must preserve existing surfaces, session
// identities and text pixels in every captured frame, including an unrelated Agent.
describe('terminal group rendering', () => {
  let resources: E2eScenarioResources
  let app: ElectronApplication
  let page: Page
  let agentReportPath: string

  beforeEach(async () => {
    resources = {}
    const workbench = await createE2eWorkbench('cleancode-group-rendering')
    resources.workbench = workbench
    const fakeCodex = await installFakeCodexCli(workbench.appStateDirectory)
    agentReportPath = fakeCodex.reportPath
    app = await launchApp(workbench, {
      environment: {
        ...createE2eTerminalEnvironment(),
        CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '0',
        CLEANCODE_FAKE_CODEX_REPORT_PATH: fakeCodex.reportPath,
        CLEANCODE_FAKE_CODEX_RASTER: '1',
        PATH: prependE2ePath(fakeCodex.binDirectory)
      }
    })
    resources.electronApp = app
    page = await app.firstWindow()
    resources.page = page
    await page.waitForLoadState('domcontentloaded')
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(3000, 1800)
    )
    await page.waitForFunction(() => innerWidth >= 3000 && innerHeight >= 1800)
    await page.evaluate(async (executable) => {
      await window.cleancode!.updateAgentProviderPreferences({
        providerOverrides: { codex: { executable, argumentsText: '', environment: {} } }
      })
    }, fakeCodex.executablePath)
  }, electronScenarioTimeoutMs)

  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  }, electronScenarioTimeoutMs)

  it.each([
    { zoom: 0.65, members: 1 },
    { zoom: 1.6, members: 3 }
  ])(
    'preserves visible ordinary and Agent terminals at zoom $zoom with $members members',
    async ({ zoom, members }) => {
      await page.getByRole('button', { name: '添加项目' }).click()
      const workbenches = await pollUntilState({
        description: 'the added project to expose its workbench before creating graph fixtures',
        observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
        accept: (workbenches) => workbenches.length === 1,
        timeoutMs: 10_000
      })
      const outsideId = await page.evaluate(
        async ({ zoom, members, workbench }) => {
          const api = window.cleancode!
          const scope = {
            projectDirectory: workbench.project.directory,
            workspaceId: workbench.graph.workspaceId
          }
          const groupGraph = await api.createTerminalGroup({
            ...scope,
            name: 'Rendering group',
            position: { x: 800, y: 200 }
          })
          const groupId = groupGraph.terminalGroups[0]!.id
          for (let index = 0; index < members; index += 1) {
            await api.createTerminalBlock({
              ...scope,
              name: `Member ${index}`,
              description: '',
              position: { x: 800, y: 150 },
              terminalGroupId: groupId
            })
          }
          const graph = await api.createTerminalBlock({
            ...scope,
            name: 'Outside',
            description: '',
            position: { x: 120, y: 200 }
          })
          await api.createWorkspaceAgent({
            ...scope,
            agentId: 'rendering-agent',
            projectId: workbench.project.id,
            workspaceDirectory: workbench.project.directory,
            gitBranch: null,
            providerId: 'codex',
            initialPosition: { x: 120, y: 650 }
          })
          await api.updateGraphViewport({ ...scope, viewport: { x: 30, y: 30, zoom } })
          return graph.blocks.find((block) => block.name === 'Outside')!.id
        },
        { zoom, members, workbench: workbenches[0]! }
      )
      await page.reload()
      for (const name of [
        ...Array.from({ length: members }, (_, index) => `Member ${index}`),
        'Outside'
      ]) {
        await waitForTerminalShellReady(page, name)
        await writeTerminalCommand(
          page,
          name,
          asE2eTerminalInput(
            createE2ePrintCommand(
              `\x1b[2J\x1b[H\x1b[?25l${Array.from({ length: 8 }, () => 'STABLE CONTENT 中文 MW MW MW MW').join('\n')}`
            )
          )
        )
        await waitForTerminalOutput(page, name, 'STABLE CONTENT')
      }
      await pollUntilState({
        description: 'Agent CLI to draw its terminal',
        observe: () => readFakeCodexCliReports(agentReportPath),
        accept: (reports) => reports.some((report) => report.kind === 'draw'),
        timeoutMs: 25_000
      })
      const selectors = [
        `[data-terminal-block-id="${outsideId}"] .terminal-viewport`,
        '.agent-terminal-viewport'
      ]
      const expectedRenderer = (await readWebgl2Availability(page)) ? 'webgl' : 'dom'
      await page.waitForFunction(
        ({ selectors, expectedRenderer }) =>
          selectors.every(
            (selector) =>
              document.querySelector<HTMLElement>(selector)?.dataset.terminalRenderer ===
              expectedRenderer
          ),
        { selectors, expectedRenderer }
      )
      await pollUntilState({
        description: 'Agent raster output to reach the visible screen',
        observe: () => readXtermInkRatio(page, page.locator('.agent-terminal-viewport')),
        accept: (ratio) => ratio > 0.05,
        timeoutMs: 10_000
      })
      const sessionId = await readTerminalSessionId(page, 'Outside')
      const agentSessionId = await page
        .locator('.agent-terminal-viewport')
        .getAttribute('data-agent-terminal-session-id')
      const monitor = await page.evaluateHandle(() => {
        const surfaces = [...document.querySelectorAll('.xterm')]
        const removed: string[] = []
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.removedNodes) {
              for (const surface of surfaces) {
                if (node.contains(surface))
                  removed.push(
                    surface.closest('.react-flow__node')?.getAttribute('data-id') ?? 'unknown'
                  )
              }
            }
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
        return { surfaces, removed, observer }
      })
      const regions = await page.evaluate(
        (selectors) =>
          selectors.map((selector) => {
            const bounds = document
              .querySelector(`${selector} .xterm-screen`)!
              .getBoundingClientRect()
            return {
              x: bounds.x / innerWidth,
              y: bounds.y / innerHeight,
              width: Math.min(bounds.width, 250) / innerWidth,
              height: Math.min(bounds.height, 120) / innerHeight
            }
          }),
        selectors
      )
      const cdp = await page.context().newCDPSession(page)
      const frames: string[] = []
      cdp.on('Page.screencastFrame', (event) => {
        frames.push(event.data)
        void cdp
          .send('Page.screencastFrameAck', { sessionId: event.sessionId })
          .catch(() => undefined)
      })
      try {
        await cdp.send('Page.startScreencast', {
          format: 'png',
          everyNthFrame: 1,
          maxWidth: 1600,
          maxHeight: 1200
        })
        await pollUntilState({
          description: 'initial terminal frame',
          observe: () => frames.length,
          accept: (count) => count > 0,
          timeoutMs: 5000
        })
        for (let cycle = 0; cycle < 2; cycle += 1) {
          await page.getByRole('button', { name: 'Rendering group 折叠组合' }).click()
          await page.waitForFunction(
            (count) => document.querySelectorAll('.terminal-node-anchor--parked').length === count,
            members
          )
          await page.getByRole('button', { name: 'Rendering group 展开组合' }).click()
          await page.waitForFunction(
            () =>
              document.querySelectorAll(
                '.terminal-node-anchor--parked, .workbench-object-motion--group-expand'
              ).length === 0
          )
        }
        await cdp.send('Page.stopScreencast')
        const attachment = await monitor.evaluate(({ surfaces, removed, observer }) => {
          observer.disconnect()
          return { removed, connected: surfaces.every((surface) => surface.isConnected) }
        })
        expect(attachment).toEqual({ removed: [], connected: true })
        expect(frames.length).toBeGreaterThan(2)
        const inkRatios = await readFrameInk(page, frames, regions)
        if (process.env.CLEANCODE_CAPTURE_RASTER) {
          const directory = join(
            process.cwd(),
            'test-results',
            'group-rendering-fixed',
            String(zoom)
          )
          await mkdir(directory, { recursive: true })
          await writeFile(join(directory, 'ink.json'), JSON.stringify(inkRatios))
          for (const [index, frame] of frames.entries()) {
            await writeFile(join(directory, `frame-${index}.png`), Buffer.from(frame, 'base64'))
          }
        }
        for (const [index, ratios] of inkRatios.entries()) {
          for (const ratio of ratios)
            expect(ratio, `frame ${index} lost terminal text`).toBeGreaterThan(0.005)
        }
      } finally {
        await monitor.evaluate(({ observer }) => observer.disconnect())
        await monitor.dispose()
        await cdp.detach()
      }
      expect(await readTerminalSessionId(page, 'Outside')).toBe(sessionId)
      expect(
        await page
          .locator('.agent-terminal-viewport')
          .getAttribute('data-agent-terminal-session-id')
      ).toBe(agentSessionId)
      await writeTerminalCommand(
        page,
        'Outside',
        asE2eTerminalInput(createE2ePrintCommand('AFTER_DISCLOSURE'))
      )
      await waitForTerminalOutput(page, 'Outside', 'AFTER_DISCLOSURE')
    },
    electronScenarioTimeoutMs
  )
})

async function readFrameInk(
  page: Page,
  frames: string[],
  regions: { x: number; y: number; width: number; height: number }[]
): Promise<number[][]> {
  return page.evaluate(
    async ({ frames, regions }) => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      const result: number[][] = []
      for (const frame of frames) {
        const image = new Image()
        image.src = `data:image/png;base64,${frame}`
        await image.decode()
        canvas.width = image.width
        canvas.height = image.height
        context.drawImage(image, 0, 0)
        result.push(
          regions.map((region) => {
            const pixels = context.getImageData(
              Math.round(region.x * image.width),
              Math.round(region.y * image.height),
              Math.round(region.width * image.width),
              Math.round(region.height * image.height)
            ).data
            const histogram = new Map<number, number>()
            for (let index = 0; index < pixels.length; index += 4) {
              const key =
                (pixels[index]! >> 4) * 256 +
                (pixels[index + 1]! >> 4) * 16 +
                (pixels[index + 2]! >> 4)
              histogram.set(key, (histogram.get(key) ?? 0) + 1)
            }
            const background = [...histogram.entries()].sort((a, b) => b[1] - a[1])[0]![0]
            let ink = 0
            for (let index = 0; index < pixels.length; index += 4) {
              if (
                Math.max(
                  Math.abs(pixels[index]! - (background >> 8) * 16),
                  Math.abs(pixels[index + 1]! - ((background >> 4) & 15) * 16),
                  Math.abs(pixels[index + 2]! - (background & 15) * 16)
                ) >= 32
              )
                ink += 1
            }
            return ink / (pixels.length / 4)
          })
        )
      }
      return result
    },
    { frames, regions }
  )
}
