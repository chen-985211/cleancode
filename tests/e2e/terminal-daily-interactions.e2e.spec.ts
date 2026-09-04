// @vitest-environment node

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
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
  asE2eTerminalInput,
  createE2eNodeCommand,
  createE2ePrintCommand,
  createE2eTerminalEnvironment,
  readTerminalSessionId,
  waitForTerminalOutput,
  waitForTerminalShellReady,
  writeTerminalCommand
} from '../support/e2eTerminal'
import { setCanvasZoomToMaximum } from '../support/workbenchNodeCreationE2e'
import {
  readWebgl2Availability,
  readXtermInkRatio,
  readXtermRasterProjection,
  readXtermRendererState
} from '../support/terminalRasterE2e'

describe('terminal daily interactions e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-terminal-daily-e2e')
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
    'keeps search, Unicode, paste and renderer fallback usable in one live session',
    async () => {
      await createRunningTerminal(page)
      const originalSessionId = await readTerminalSessionId(page, 'Terminal 1')
      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(
          createE2ePrintCommand('SEARCH_TARGET one\n中文，🙂，é\nSEARCH_TARGET two')
        )
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'SEARCH_TARGET two')

      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f')
      const search = page.getByRole('searchbox', { name: '搜索终端输出' })
      await search.fill('SEARCH_TARGET')
      await pollUntilState({
        description: 'terminal search to find both matches',
        observe: () => page.locator('.terminal-search__results').textContent(),
        accept: (results) => /^[12] \/ 2$/u.test(results?.trim() ?? ''),
        timeoutMs: 10_000
      })

      if (process.env.CLEANCODE_CAPTURE_PHASE_TWO_VISUAL === '1') {
        const resultDirectory = join(process.cwd(), 'test-results')
        await mkdir(resultDirectory, { recursive: true })
        await page.screenshot({
          path: join(resultDirectory, 'terminal-phase-two-search.png')
        })
      }

      await search.press('Escape')
      const terminalViewport = page.locator('[data-terminal-block-id] .terminal-viewport')
      const initialRenderer = await terminalViewport.getAttribute('data-terminal-renderer')
      expect(['dom', 'webgl']).toContain(initialRenderer)
      if (initialRenderer === 'webgl') {
        await terminalViewport.evaluate((element) => {
          for (const canvas of element.querySelectorAll('canvas')) {
            canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
            canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
          }
        })
        const renderer = await pollUntilState({
          description: 'terminal renderer to fall back to DOM',
          observe: () => terminalViewport.getAttribute('data-terminal-renderer'),
          accept: (currentRenderer) => currentRenderer === 'dom',
          timeoutMs: 5_000
        })
        expect(renderer).toBe('dom')
      }

      const clipboardText = asE2eTerminalInput(
        createE2ePrintCommand('__PASTE_AFTER_RENDERER_FALLBACK__')
      )
      await terminalViewport.evaluate((element, text) => {
        const clipboardData = new DataTransfer()
        clipboardData.setData('text/plain', text)
        element
          .querySelector('textarea')
          ?.dispatchEvent(
            new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData })
          )
      }, clipboardText)
      await waitForTerminalOutput(page, 'Terminal 1', '__PASTE_AFTER_RENDERER_FALLBACK__')

      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(originalSessionId)
    },
    electronScenarioTimeoutMs
  )

  it(
    'raises the WebGL backing density after canvas zoom without resizing the PTY grid',
    async () => {
      await createRunningTerminal(page)
      const sessionId = await readTerminalSessionId(page, 'Terminal 1')
      const terminalViewport = page
        .locator('[data-terminal-block-id]')
        .filter({ has: page.locator(`[data-terminal-session-id="${sessionId}"]`) })
        .locator('.terminal-viewport')
      const rendererState = await pollUntilState({
        description: 'focused terminal renderer activation',
        observe: () => readXtermRendererState(terminalViewport),
        accept: (state) => state.ready && ['dom', 'webgl'].includes(state.renderer),
        intervalMs: 50,
        timeoutMs: 10_000
      })
      const webgl2Available = await readWebgl2Availability(page)
      if (rendererState.renderer !== 'webgl' && webgl2Available) {
        throw new Error(`Expected terminal WebGL renderer, received ${rendererState.renderer}.`)
      }
      const initialRasterProjection =
        rendererState.renderer === 'webgl'
          ? await pollUntilState({
              description: 'focused terminal baseline WebGL backing store',
              observe: () => readXtermRasterProjection(terminalViewport),
              accept: (projection) =>
                projection !== null &&
                projection.renderer === 'webgl' &&
                projection.rasterScale === 1 &&
                projection.backingWidth > 0,
              intervalMs: 50,
              timeoutMs: 10_000
            })
          : null
      const visualMarker = Array.from(
        { length: 6 },
        (_, index) => `__RASTER_VISIBLE_${index}__ ${'MW'.repeat(18)}`
      ).join('\n')
      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(createE2ePrintCommand(visualMarker))
      )
      await waitForTerminalOutput(page, 'Terminal 1', '__RASTER_VISIBLE_5__')
      await pollUntilState({
        description: 'visible terminal pixels before canvas zoom',
        observe: () => readXtermInkRatio(page, terminalViewport),
        accept: (ratio) => ratio > 0.01,
        intervalMs: 50,
        retryObservationErrors: true,
        timeoutMs: 10_000
      })
      const beforeDimensions = await probeTerminalDimensions(page, sessionId, 'BEFORE')
      const beforeCssGeometry =
        rendererState.renderer === 'webgl' ? await readTerminalCssGeometry(page, sessionId) : null

      expect(await setCanvasZoomToMaximum(page, workbench.projectDirectory)).toBeCloseTo(1.6, 2)

      const rasterProjection =
        rendererState.renderer === 'webgl'
          ? await pollUntilState({
              description: 'focused terminal WebGL backing store to cover the maximum canvas zoom',
              observe: () => readXtermRasterProjection(terminalViewport),
              accept: (projection) =>
                projection !== null &&
                projection.renderer === 'webgl' &&
                Math.abs(projection.rasterScale - projection.zoom) < 0.001 &&
                projection.zoom >= 1.599 &&
                Math.abs(
                  projection.backingWidth - projection.displayWidth * projection.devicePixelRatio
                ) < 1,
              intervalMs: 50,
              timeoutMs: 10_000
            })
          : null
      const afterInkRatio = await pollUntilState({
        description: 'visible terminal pixels after canvas zoom',
        observe: () => readXtermInkRatio(page, terminalViewport),
        accept: (ratio) => ratio > 0.01,
        intervalMs: 50,
        retryObservationErrors: true,
        timeoutMs: 10_000
      })
      const afterCssGeometry =
        rendererState.renderer === 'webgl' ? await readTerminalCssGeometry(page, sessionId) : null
      const afterDimensions = await probeTerminalDimensions(page, sessionId, 'AFTER')

      if (process.env.CLEANCODE_CAPTURE_RASTER) {
        const output = join(
          process.cwd(),
          'test-results',
          'terminal-raster',
          process.env.CLEANCODE_CAPTURE_RASTER
        )
        await mkdir(output, { recursive: true })
        await page.screenshot({ path: join(output, 'application-maximum-zoom.png') })
      }

      if (rendererState.renderer === 'webgl') {
        expect(rasterProjection).not.toBeNull()
        expect(initialRasterProjection).not.toBeNull()
        expect(beforeCssGeometry).not.toBeNull()
        expect(rasterProjection!.backingWidth).toBeGreaterThan(rasterProjection!.displayWidth)
        expect(afterCssGeometry!.screenWidth).toBe(beforeCssGeometry!.screenWidth)
        expect(afterCssGeometry!.screenHeight).toBe(beforeCssGeometry!.screenHeight)
        // The drawing surface may shift its edge by half a physical pixel;
        // the xterm screen (and therefore FitAddon's grid) remains unchanged.
        for (const dimension of ['canvasWidth', 'canvasHeight'] as const) {
          const correction = Math.abs(
            Number.parseFloat(afterCssGeometry![dimension]) -
              Number.parseFloat(beforeCssGeometry![dimension])
          )
          expect(
            correction * rasterProjection!.zoom * rasterProjection!.devicePixelRatio
          ).toBeLessThanOrEqual(0.51)
        }
      } else {
        expect(rendererState.renderer).toBe('dom')
        expect(webgl2Available).toBe(false)
      }
      expect(afterInkRatio).toBeGreaterThan(0.01)
      expect(afterDimensions).toEqual(beforeDimensions)
      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(sessionId)
    },
    electronScenarioTimeoutMs
  )
})

async function createRunningTerminal(page: Page): Promise<void> {
  await expectDesktopRuntime(page)
  await page.getByRole('button', { name: '添加项目' }).click()
  await selectBlankCanvasAction(page, '新建终端积木')
  await readTerminalSessionId(page, 'Terminal 1')
  await waitForTerminalShellReady(page, 'Terminal 1')
  const terminalInput = page.getByLabel('Terminal input')
  await terminalInput.focus()
  await pollUntilState({
    description: 'terminal input to receive focus',
    observe: () => terminalInput.evaluate((element) => element === document.activeElement),
    accept: Boolean,
    timeoutMs: 5_000
  })
}

async function probeTerminalDimensions(
  page: Page,
  sessionId: string,
  phase: 'BEFORE' | 'AFTER'
): Promise<{ readonly columns: number; readonly rows: number }> {
  const marker = `__RASTER_SIZE_${phase}__`
  await writeTerminalCommand(
    page,
    'Terminal 1',
    asE2eTerminalInput(
      createE2eNodeCommand(
        `process.stdout.write(${JSON.stringify(marker)} + process.stdout.rows + 'x' + process.stdout.columns + '__\\n')`
      )
    )
  )
  const dimensions = await pollUntilState({
    description: `${phase.toLowerCase()} terminal dimensions for session ${sessionId}`,
    observe: () =>
      page.evaluate(
        ({ marker, sessionId }) => {
          const output = Array.from(
            document.querySelectorAll<HTMLElement>('[data-terminal-session-id]')
          ).find((element) => element.dataset.terminalSessionId === sessionId)
          const match = output?.textContent?.match(new RegExp(`${marker}(\\d+)x(\\d+)__`, 'u'))
          return match ? { rows: Number(match[1]), columns: Number(match[2]) } : null
        },
        { marker, sessionId }
      ),
    accept: (value) => value !== null && value.columns > 0 && value.rows > 0,
    timeoutMs: 10_000
  })

  if (!dimensions) throw new Error(`Unable to read ${phase.toLowerCase()} terminal dimensions.`)
  return dimensions
}

function readTerminalCssGeometry(
  page: Page,
  sessionId: string
): Promise<{
  readonly canvasHeight: string
  readonly canvasWidth: string
  readonly screenHeight: string
  readonly screenWidth: string
} | null> {
  return page.evaluate((sessionId) => {
    const output = Array.from(
      document.querySelectorAll<HTMLElement>('[data-terminal-session-id]')
    ).find((element) => element.dataset.terminalSessionId === sessionId)
    const screen = output
      ?.closest('[data-terminal-block-id]')
      ?.querySelector<HTMLElement>('.terminal-viewport .xterm-screen')
    const canvas = Array.from(screen?.querySelectorAll('canvas') ?? []).find((entry) =>
      entry.getContext('webgl2')
    )
    if (!screen || !canvas) return null

    return {
      canvasHeight: canvas.style.height,
      canvasWidth: canvas.style.width,
      screenHeight: screen.style.height,
      screenWidth: screen.style.width
    }
  }, sessionId)
}
