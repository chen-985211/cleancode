// @vitest-environment node

import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ElectronApplication, Locator, Page } from 'playwright'

import { writeQuickLaunchFixtureScript } from '../fixtures/contexts/run/fakeTerminalPrograms'
import { readE2eBlockGraph } from '../support/e2eBlockGraph'
import { pollUntilState } from '../support/e2ePolling'
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
import { readCanvasViewportTransform } from '../support/terminalSelectionE2e'
import {
  configureAndStartTerminalLaunchCommand,
  createE2eNodeScriptCommand,
  createE2eTerminalEnvironment,
  readTerminalSessionId,
  waitForTerminalOutput,
  waitForTerminalShellReady
} from '../support/e2eTerminal'

describe('quick execution e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-quick-execution-e2e')
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
    'binds, follows, persists, and executes a terminal from the quick execution bar',
    async () => {
      await createRunningTerminal(page)

      const launchOutput = 'quick-launch-e2e-once'
      const { reportPath, scriptPath } = await writeQuickLaunchFixtureScript(
        workbench.projectDirectory,
        launchOutput
      )
      const launchCommand = createE2eNodeScriptCommand(scriptPath, [reportPath])

      await configureAndStartTerminalLaunchCommand(page, 'Terminal 1', launchCommand)
      await waitForTerminalOutput(page, 'Terminal 1', launchOutput)

      const graph = await readE2eBlockGraph(workbench)

      expect(graph.blocks[0]?.launchCommand).toBe(launchCommand)
      expect(await waitForTextFile(reportPath)).toBe(`${launchOutput}\n`)

      await page.getByRole('button', { name: '添加画布对象' }).click()
      const objectPicker = page.getByRole('dialog', { name: '选择要绑定的画布对象' })
      await objectPicker.getByRole('button').filter({ hasText: 'Terminal 1' }).click()
      const firstSlotTarget = await pollUntilState({
        description: 'quick execution slot 1 to persist its terminal target',
        observe: async () => (await readE2eBlockGraph(workbench)).quickExecutionSlots?.[0]?.target,
        accept: (target) =>
          target?.type === 'terminal' && target.terminalBlockId === graph.blocks[0]?.id,
        timeoutMs: 10_000
      })
      expect(firstSlotTarget).toEqual({
        type: 'terminal',
        terminalBlockId: graph.blocks[0]?.id
      })

      const quickExecutionTooltip = `已绑定终端「Terminal 1」。执行快捷位 1 (${process.platform === 'darwin' ? '⌘1' : 'Ctrl+1'})；点击仅用于定位视图。`
      await page.locator('[data-quick-execution-slot="1"]').hover()
      await waitForLocatorText(
        page.getByRole('tooltip'),
        quickExecutionTooltip,
        'quick slot tooltip'
      )
      await page.mouse.move(0, 0)
      await page.getByRole('tooltip').waitFor({ state: 'detached' })

      if (process.env.CLEANCODE_CAPTURE_QUICK_EXECUTION_VISUAL === '1') {
        const resultDirectory = join(process.cwd(), 'test-results')
        await mkdir(resultDirectory, { recursive: true })
        await selectTheme(page, 'light')
        await waitForQuickExecutionVisualToSettle(page)
        await page.screenshot({ path: join(resultDirectory, 'quick-execution-light.png') })
        await page.locator('[data-quick-execution-slot="1"]').hover()
        await waitForLocatorText(
          page.getByRole('tooltip'),
          quickExecutionTooltip,
          'quick slot tooltip in light theme'
        )
        await waitForQuickExecutionVisualToSettle(page)
        await page.screenshot({
          path: join(resultDirectory, 'quick-execution-light-hover.png')
        })
        await selectTheme(page, 'dark')
        await waitForQuickExecutionVisualToSettle(page)
        await page.screenshot({ path: join(resultDirectory, 'quick-execution-dark.png') })
        await electronApp.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows()[0]?.setSize(960, 640)
        })
        await page.waitForFunction(() => window.innerWidth <= 960)
        await page.screenshot({
          path: join(resultDirectory, 'quick-execution-dark-narrow.png')
        })
        await electronApp.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows()[0]?.setSize(1440, 900)
        })
        await page.waitForFunction(() => window.innerWidth >= 1400)
      }

      await page
        .locator('[data-quick-execution-slot="1"]')
        .dragTo(page.locator('[data-quick-execution-slot="2"]'))
      const reorderedSlots = await pollUntilState({
        description: 'quick execution slots to persist their reordered targets',
        observe: async () => (await readE2eBlockGraph(workbench)).quickExecutionSlots?.slice(0, 2),
        accept: (slots) =>
          slots?.[0]?.number === 1 &&
          slots[0].target === null &&
          slots[1]?.number === 2 &&
          slots[1].target?.type === 'terminal' &&
          slots[1].target.terminalBlockId === graph.blocks[0]?.id,
        timeoutMs: 10_000
      })
      expect(reorderedSlots).toEqual([
        { number: 1, target: null },
        { number: 2, target: { type: 'terminal', terminalBlockId: graph.blocks[0]?.id } }
      ])

      const boundSlot = page.getByRole('button', {
        name: '快捷位 2：Terminal 1，点击定位，仅支持快捷键执行'
      })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.waitForFunction(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
      await boundSlot.click()
      expect(await waitForTextFile(reportPath)).toBe(`${launchOutput}\n`)
      await waitForCanvasViewportToSettle(page)
      const focusedViewport = await readCanvasViewportTransform(page)
      expect(await panCanvasAwayFromQuickExecutionTarget(page)).not.toBe(focusedViewport)
      await page.getByRole('button', { name: '新建 Agent' }).focus()
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+2' : 'Control+2')
      await waitForQuickLaunchCount(reportPath, launchOutput, 2)
      await waitForCanvasViewportTransform(
        page,
        focusedViewport,
        'quick execution shortcut to follow its canvas target'
      )
      expect(
        await setQuickExecutionTargetFollowing(page, false, 'quick-execution-canvas-settings.png')
      ).toBe(true)

      await electronApp.close()
      resources.electronApp = undefined
      electronApp = await launchApp(workbench, {
        environment: createE2eTerminalEnvironment()
      })
      resources.electronApp = electronApp
      page = await electronApp.firstWindow()
      resources.page = page
      await page.waitForLoadState('domcontentloaded')

      const restoredSlot = page.getByRole('button', {
        name: '快捷位 2：Terminal 1，点击定位，仅支持快捷键执行'
      })
      await pollUntilState({
        description: 'workbench restoration to expose persisted quick execution slot 2',
        observe: async () => ({
          restoring: (await page.locator('[aria-label="正在恢复上次的工作台"]').count()) > 0,
          slotVisible: await restoredSlot.isVisible()
        }),
        accept: (state) => !state.restoring && state.slotVisible,
        timeoutMs: 10_000
      })
      expect(await setQuickExecutionTargetFollowing(page, false)).toBe(false)
      const unfollowedViewport = await panCanvasAwayFromQuickExecutionTarget(page)
      await page.getByRole('button', { name: '新建 Agent' }).focus()
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+2' : 'Control+2')
      await waitForQuickLaunchCount(reportPath, launchOutput, 3)
      await waitForCanvasViewportToSettle(page)
      expect(await readCanvasViewportTransform(page)).toBe(unfollowedViewport)

      const quickSlot = page.locator('[data-quick-execution-slot="2"]')
      const quickSlotBox = await quickSlot.boundingBox()
      if (!quickSlotBox) throw new Error('Quick execution slot 2 is not visible')

      await page.mouse.move(
        quickSlotBox.x + quickSlotBox.width / 2,
        quickSlotBox.y + quickSlotBox.height / 2
      )
      await page.mouse.down()
      await page.mouse.move(
        quickSlotBox.x + quickSlotBox.width / 2 + 8,
        quickSlotBox.y + quickSlotBox.height / 2,
        { steps: 4 }
      )
      const trashTarget = page.locator('[data-quick-execution-trash]')
      const trashAriaHidden = await pollUntilState({
        description: 'quick execution trash target to become available',
        observe: () => trashTarget.getAttribute('aria-hidden'),
        accept: (value) => value === 'false',
        timeoutMs: 5_000
      })
      expect(trashAriaHidden).toBe('false')

      const trashBox = await trashTarget.boundingBox()
      if (!trashBox) throw new Error('Quick execution trash target is not visible')
      await page.mouse.move(trashBox.x + trashBox.width / 2, trashBox.y + trashBox.height / 2, {
        steps: 8
      })
      await page.mouse.up()
      const clearedTarget = await pollUntilState({
        description: 'quick execution slot 2 target to be cleared',
        observe: async () => (await readE2eBlockGraph(workbench)).quickExecutionSlots?.[1]?.target,
        accept: (target) => target === null,
        timeoutMs: 10_000
      })
      expect(clearedTarget).toBeNull()
      await restoredSlot.waitFor({ state: 'detached' })
    },
    electronScenarioTimeoutMs
  )
})

async function waitForQuickLaunchCount(
  reportPath: string,
  marker: string,
  expectedCount: number
): Promise<void> {
  const count = await pollUntilState({
    description: `quick launch report count to become ${expectedCount}`,
    observe: async () =>
      (await readFile(reportPath, 'utf8')).split('\n').filter((line) => line === marker).length,
    accept: (currentCount) => currentCount === expectedCount,
    intervalMs: 50,
    timeoutMs: 10_000
  })

  expect(count).toBe(expectedCount)
}

async function waitForLocatorText(
  locator: Locator,
  expectedText: string,
  description: string
): Promise<void> {
  const text = await pollUntilState({
    description,
    observe: () => locator.textContent(),
    accept: (currentText) => currentText === expectedText,
    timeoutMs: 5_000
  })

  expect(text).toBe(expectedText)
}

async function selectTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.getByRole('button', { name: '主题设置' }).click()
  await page.getByText(theme === 'light' ? '浅色' : '深色', { exact: true }).click()
  await page.waitForFunction(
    (expectedTheme) => document.documentElement.dataset.theme === expectedTheme,
    theme
  )
  await page.getByRole('button', { name: '关闭主题设置' }).click()
  await page.locator('.theme-settings-backdrop').waitFor({ state: 'detached' })
  await page.waitForFunction(() => document.querySelector('[inert]') === null)
}

async function waitForQuickExecutionVisualToSettle(page: Page): Promise<void> {
  await page.locator('[data-quick-execution-bar]').evaluate(async (bar) => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    await Promise.allSettled(
      bar.getAnimations({ subtree: true }).map((animation) => animation.finished)
    )
  })
}

async function setQuickExecutionTargetFollowing(
  page: Page,
  enabled: boolean,
  visualArtifactName?: string
): Promise<boolean> {
  await page.mouse.move(0, 0)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '画布', exact: true }).click()
  const toggle = page.getByRole('switch', { name: '快捷执行后跟随目标' })
  const wasEnabled = (await toggle.getAttribute('aria-checked')) === 'true'

  if (process.env.CLEANCODE_CAPTURE_QUICK_EXECUTION_VISUAL === '1' && visualArtifactName) {
    await page.locator('.application-settings-surface').evaluate(async (surface) => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      await Promise.allSettled(
        surface.getAnimations({ subtree: true }).map((animation) => animation.finished)
      )
    })
    const resultDirectory = join(process.cwd(), 'test-results')
    await mkdir(resultDirectory, { recursive: true })
    await page.screenshot({
      path: join(resultDirectory, visualArtifactName),
      style: '[role="tooltip"] { visibility: hidden !important; }'
    })
  }

  if (wasEnabled !== enabled) await toggle.click()
  await page.getByRole('button', { name: '返回工作区' }).click()
  await page.locator('.application-settings-surface').waitFor({ state: 'detached' })
  await page.waitForFunction(() => document.querySelector('[inert]') === null)
  return wasEnabled
}

async function panCanvasAwayFromQuickExecutionTarget(page: Page): Promise<string> {
  const pane = page.locator('.react-flow__pane')
  const start = await pane.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const fractions = [0.1, 0.25, 0.75, 0.9]
    for (const yFraction of fractions) {
      for (const xFraction of fractions) {
        const point = {
          x: bounds.left + bounds.width * xFraction,
          y: bounds.top + bounds.height * yFraction
        }
        if (document.elementFromPoint(point.x, point.y) === element) return point
      }
    }
    return null
  })
  if (!start) throw new Error('No unobstructed canvas point is available for panning.')

  const previousTransform = await readCanvasViewportTransform(page)
  const paneBounds = await pane.boundingBox()
  if (!paneBounds) throw new Error('The canvas pane is not visible for panning.')
  const distance = Math.min(520, paneBounds.width * 0.38)
  const targetX =
    start.x < paneBounds.x + paneBounds.width / 2 ? start.x + distance : start.x - distance

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(targetX, start.y, { steps: 12 })
  await page.mouse.up()

  const transformed = await pollUntilState({
    description: 'canvas pan away from the quick execution target',
    observe: () => readCanvasViewportTransform(page),
    accept: (transform) => transform !== previousTransform,
    timeoutMs: 5_000
  })
  await waitForCanvasViewportToSettle(page)
  return transformed
}

async function waitForCanvasViewportTransform(
  page: Page,
  expectedTransform: string,
  description: string
): Promise<void> {
  const transform = await pollUntilState({
    description,
    observe: () => readCanvasViewportTransform(page),
    accept: (currentTransform) => currentTransform === expectedTransform,
    timeoutMs: 5_000
  })
  expect(transform).toBe(expectedTransform)
}

async function waitForCanvasViewportToSettle(page: Page): Promise<void> {
  let previousTransform = ''
  let stableObservationCount = 0

  await pollUntilState({
    description: 'quick execution canvas viewport to settle',
    observe: () => readCanvasViewportTransform(page),
    accept: (transform) => {
      stableObservationCount = transform === previousTransform ? stableObservationCount + 1 : 0
      previousTransform = transform
      return stableObservationCount >= 3
    },
    intervalMs: 50,
    timeoutMs: 5_000
  })
}

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
