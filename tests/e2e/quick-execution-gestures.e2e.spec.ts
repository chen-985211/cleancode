// @vitest-environment node

import { mkdir, writeFile } from 'node:fs/promises'
import type { Page } from 'playwright'
import {
  createE2eWorkbench,
  launchApp,
  teardownE2eScenario,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  type E2eWorkbench,
  type E2eScenarioResources
} from '../support/e2eWorkbench'
import { createE2eTerminalEnvironment } from '../support/e2eTerminal'
import { readE2eBlockGraph } from '../support/e2eBlockGraph'
import { pollUntilState } from '../support/e2ePolling'
import { setElectronContentSize } from '../support/e2eWindow'
import {
  selectTheme,
  waitForQuickExecutionVisualToSettle
} from '../support/quickExecutionVisualE2e'

// Representative native gestures only. Target/state/zoom matrices live in
// quick-execution-focus.spec.ts, quick-execution-actions.spec.tsx and
// block-graph.quick-execution-bar.presentation.spec.tsx.
// Real pointer capture, gesture ownership and screen geometry require Electron.
// Each case owns its process/profile/project. Graph IDs survive reload; visible
// target bounds and persisted graph facts are the oracles, not animation timing.
describe('quick execution gesture ownership', () => {
  let workbench: E2eWorkbench
  let resources: E2eScenarioResources
  let page: Page
  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-quick-gestures')
    resources.workbench = workbench
    const app = await launchApp(workbench, { environment: createE2eTerminalEnvironment() })
    resources.electronApp = app
    page = await app.firstWindow()
    resources.page = page
    await mkdir('test-results/quick-execution-gestures', { recursive: true })
  }, electronLaunchTimeoutMs)
  afterEach(async ({ task }) =>
    teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  )

  const cases = [
    { group: 'outside', width: 2200, height: 1300, theme: 'light', zoom: 1 },
    { group: 'expanded', width: 1200, height: 900, theme: 'dark', zoom: 0.65 },
    { group: 'collapsed', width: 1600, height: 1000, theme: 'light', zoom: 1.6 }
  ] as const

  async function prepare(scenario: (typeof cases)[number], onlyGroupVisible = false) {
    await setElectronContentSize(resources.electronApp!, scenario)
    await page.getByRole('button', { name: '添加项目' }).click()
    const entries = await pollUntilState({
      description: 'registered quick gesture project',
      observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
      accept: (entries) => entries.length === 1,
      timeoutMs: 10000
    })
    const graph = await page.evaluate(
      async ({ entry, scenario, onlyGroupVisible }) => {
        const api = window.cleancode!
        const scope = {
          projectDirectory: entry.project.directory,
          workspaceId: entry.graph.workspaceId
        }
        let graph = entry.graph
        for (const [index, name] of ['Install', 'Serve', 'Standalone', 'Group member'].entries())
          graph = await api.createTerminalBlock({
            ...scope,
            name,
            description: '',
            position: { x: 500 + index * 550, y: 350 + index * 170 }
          })
        graph = await api.connectTerminalBlocks({
          ...scope,
          sourceBlockId: graph.blocks[0]!.id,
          targetBlockId: graph.blocks[1]!.id
        })
        graph = await api.createTerminalGroup({
          ...scope,
          name: 'Application',
          position: { x: 2400, y: 800 }
        })
        graph = await api.moveTerminalWorkflowToGroup({
          ...scope,
          blockId: graph.blocks[3]!.id,
          targetTerminalGroupId: graph.terminalGroups[0]!.id,
          scope: 'terminal',
          position: graph.blocks[3]!.position
        })
        if (scenario.group !== 'outside')
          graph = await api.moveTerminalWorkflowToGroup({
            ...scope,
            blockId: graph.blocks[0]!.id,
            targetTerminalGroupId: graph.terminalGroups[0]!.id,
            scope: 'workflow',
            position: graph.blocks[0]!.position
          })
        if (onlyGroupVisible)
          graph = await api.moveTerminalWorkflowToGroup({
            ...scope,
            blockId: graph.blocks[2]!.id,
            targetTerminalGroupId: graph.terminalGroups[0]!.id,
            scope: 'terminal',
            position: graph.blocks[2]!.position
          })
        if (scenario.group === 'collapsed')
          graph = await api.setTerminalGroupCollapsed({
            ...scope,
            terminalGroupId: graph.terminalGroups[0]!.id,
            isCollapsed: true
          })
        for (const target of [
          {
            type: 'workflow' as const,
            terminalBlockIds: graph.blocks.slice(0, 2).map((block) => block.id)
          },
          { type: 'combination' as const, terminalGroupId: graph.terminalGroups[0]!.id },
          { type: 'terminal' as const, terminalBlockId: graph.blocks[2]!.id }
        ])
          graph = await api.addQuickExecutionTarget({ ...scope, target })
        await api.updateGraphViewport({
          ...scope,
          viewport: { x: -250, y: -200, zoom: scenario.zoom }
        })
        return graph
      },
      { entry: entries[0]!, scenario, onlyGroupVisible }
    )
    await page.reload()
    await page.locator('[data-quick-execution-slot="1"]').waitFor()
    await selectTheme(page, scenario.theme)
    await waitForQuickExecutionVisualToSettle(page)
    return graph
  }

  it(
    'binds a canvas terminal dropped into the statusbar without moving the object',
    async () => {
      await prepare(cases[0])
      const graph = await page.evaluate(async () => {
        const api = window.cleancode!
        const entry = (await api.listWorkbenches())[0]!
        return api.createTerminalBlock({
          projectDirectory: entry.project.directory,
          workspaceId: entry.graph.workspaceId,
          name: 'Drag into Dock',
          description: '',
          position: { x: 600, y: 300 }
        })
      })
      const terminal = graph.blocks.at(-1)!
      await page.reload()
      const header = page.locator(
        `[data-terminal-block-id="${terminal.id}"] .terminal-node__header`
      )
      await header.waitFor()
      await waitForQuickExecutionVisualToSettle(page)
      const source = (await header.boundingBox())!
      const dock = page.locator('[data-quick-execution-bar]')
      const destination = (await dock.boundingBox())!
      await page.mouse.move(source.x + 100, source.y + source.height / 2)
      await page.mouse.down()
      try {
        await page.mouse.move(
          destination.x + destination.width - 12,
          destination.y + destination.height / 2,
          { steps: 20 }
        )
        await page.locator('.quick-execution--drop-target').waitFor()
      } finally {
        await page.mouse.up()
      }
      const bound = await pollUntilState({
        description: 'canvas terminal binding persisted from statusbar drop',
        observe: () => readE2eBlockGraph(workbench),
        accept: (next) => {
          const target = next.quickExecutionSlots?.[3]?.target
          return target?.type === 'terminal' && target.terminalBlockId === terminal.id
        },
        timeoutMs: 5000
      })
      expect(bound.blocks).toEqual(graph.blocks)
      expect(bound.terminalGroups).toEqual(graph.terminalGroups)
    },
    electronScenarioTimeoutMs
  )

  it(
    'preserves readable zoom while retargeting compact slots during flight',
    async () => {
      const graph = await prepare(cases[2], true)
      const samples = await recordViewportMotion(page, 'click', async () => {
        const initialTransform = await page.locator('.react-flow__viewport').getAttribute('style')
        await page.locator('[data-quick-execution-slot="1"] button').click()
        await page.waitForFunction(
          (initial) =>
            document.querySelector('.react-flow__viewport')!.getAttribute('style') !== initial,
          initialTransform
        )
        await page.locator('[data-quick-execution-slot="2"] button').click()
        await page.locator('[data-quick-execution-slot="3"] button').click()
      })
      await writeFile(
        `test-results/quick-execution-gestures/motion-in-flight.json`,
        JSON.stringify(samples, null, 2)
      )
      expect(samples.length).toBeGreaterThan(5)
      const initial = samples[0]!
      const final = samples.at(-1)!
      expect(new Set(samples.map(({ x, y, zoom }) => `${x},${y},${zoom}`)).size).toBeGreaterThan(5)
      expect(final.zoom).toBeCloseTo(initial.zoom, 3)
      const target = page.locator(`.react-flow__node[data-id="${graph.terminalGroups[0]!.id}"]`)
      expect(await target.isVisible()).toBe(true)
      const geometry = await readFocusGeometry(page, [graph.terminalGroups[0]!.id])
      expect(geometry.centerError).toBeLessThan(2)
      expect(geometry.overflow).toBeLessThan(1)
      const focused = await readE2eBlockGraph(workbench)
      expect(focused.blocks).toEqual(graph.blocks)
      expect(focused.terminalGroups).toEqual(graph.terminalGroups)
      await page.screenshot({ path: `test-results/quick-execution-gestures/motion-in-flight.png` })
    },
    electronScenarioTimeoutMs
  )

  it.each([cases[1]])(
    'focuses complete targets in the visible safe viewport: $group',
    async (scenario) => {
      const graph = await prepare(scenario)
      const ids = [
        graph.blocks.slice(0, 2).map((block) => block.id),
        [graph.terminalGroups[0]!.id],
        [graph.blocks[2]!.id]
      ]
      for (const [index, targetIds] of ids.entries()) {
        await page.locator(`[data-quick-execution-slot="${index + 1}"] button`).click()
        await pollUntilState({
          description: 'complete quick target centered inside safe screen area',
          observe: () => readFocusGeometry(page, targetIds),
          accept: (value) => value.centerError < 2 && value.overflow < 1,
          timeoutMs: 5000
        })
        const focused = await readE2eBlockGraph(workbench)
        expect(focused.blocks).toEqual(graph.blocks)
        expect(focused.terminalGroups).toEqual(graph.terminalGroups)
        await page.screenshot({
          path: `test-results/quick-execution-gestures/${scenario.group}-focus-${index + 1}.png`
        })
      }
    },
    electronScenarioTimeoutMs
  )

  it.each([cases[0]])(
    'drags only bindings and preserves all canvas objects: $group',
    async (scenario) => {
      const graph = await prepare(scenario)
      const initial = await readCanvasTransforms(page)
      for (const number of [1, 2, 3]) {
        const slot = page.locator(`[data-quick-execution-slot="${number}"]`)
        const box = (await slot.boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        try {
          await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, { steps: 4 })
          await page.locator('[data-quick-execution-drag-proxy]').waitFor({ timeout: 2500 })
          expect(await slot.boundingBox()).toEqual(box)
          const proxy = (await page.locator('[data-quick-execution-drag-proxy]').boundingBox())!
          expect(proxy.width).toBeCloseTo(38, 2)
          expect(proxy.height).toBeCloseTo(24, 2)
          await page.mouse.move(box.x + box.width / 2 + 22, box.y + box.height / 2 - 7)
          const moved = (await page.locator('[data-quick-execution-drag-proxy]').boundingBox())!
          expect(Math.abs(moved.x - proxy.x - 12)).toBeLessThan(1)
          expect(Math.abs(moved.y - proxy.y + 7)).toBeLessThan(1)
          expect(await page.locator('[data-quick-execution-drag-proxy] kbd').count()).toBe(0)
          expect(
            await page
              .locator('[data-quick-execution-slots="dock"] [data-quick-execution-slot]')
              .count()
          ).toBe(3)
          expect(await page.locator('.quick-execution__drag-proxy--near-black-hole').count()).toBe(
            0
          )
          const canvas = (await page.locator('.react-flow').boundingBox())!
          await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, {
            steps: 12
          })
          expect(await readCanvasTransforms(page)).toEqual(initial)
          await page.screenshot({
            path: `test-results/quick-execution-gestures/${scenario.group}-drag-${number}.png`
          })
        } finally {
          await page.mouse.up()
        }
        await page.locator('[data-quick-execution-return-animation]').waitFor({ state: 'detached' })
        await page.locator('[data-quick-execution-drag-proxy]').waitFor({ state: 'detached' })
        expect(await readCanvasTransforms(page)).toEqual(initial)
        const after = await readE2eBlockGraph(workbench)
        expect(after.blocks).toEqual(graph.blocks)
        expect(after.terminalGroups).toEqual(graph.terminalGroups)
        expect(after.quickExecutionSlots).toEqual(graph.quickExecutionSlots)
      }
      const source = (await page.locator('[data-quick-execution-slot="1"]').boundingBox())!
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
      await page.mouse.down()
      try {
        await page.mouse.move(source.x + source.width / 2 + 10, source.y + source.height / 2, {
          steps: 4
        })
        await page.locator('[data-quick-execution-drag-proxy]').waitFor({ timeout: 2500 })
        // Compact sorting exchanges occupied entries without revealing empty positions.
        const destination = (await page.locator('[data-quick-execution-slot="2"]').boundingBox())!
        await page.mouse.move(
          destination.x + destination.width / 2,
          destination.y + destination.height / 2,
          { steps: 8 }
        )
        expect(
          await page
            .locator('[data-quick-execution-slot="2"] [data-quick-execution-swap-preview]')
            .count()
        ).toBe(1)
        expect(await readCanvasTransforms(page)).toEqual(initial)
      } finally {
        await page.mouse.up()
      }
      const reordered = await pollUntilState({
        description: 'workflow and combination slot exchange persisted',
        observe: () => readE2eBlockGraph(workbench),
        accept: (next) => next.quickExecutionSlots?.[1]?.target?.type === 'workflow',
        timeoutMs: 5000
      })
      expect(reordered.blocks).toEqual(graph.blocks)
      expect(reordered.terminalGroups).toEqual(graph.terminalGroups)
      expect(reordered.quickExecutionSlots?.[0]?.target).toEqual(
        graph.quickExecutionSlots?.[1]?.target
      )
      await page.reload()
      await page.locator('[data-quick-execution-slot="2"]').waitFor()
      expect((await readE2eBlockGraph(workbench)).quickExecutionSlots).toEqual(
        reordered.quickExecutionSlots
      )
    },
    electronScenarioTimeoutMs
  )
})

interface MotionSample {
  readonly time: number
  readonly x: number
  readonly y: number
  readonly zoom: number
}

async function recordViewportMotion(
  page: Page,
  event: 'click' | 'keydown',
  action: () => Promise<void>
) {
  await page.evaluate((event) => {
    const state = window as typeof window & { motionSamples: Promise<MotionSample[]> }
    state.motionSamples = new Promise((resolve) => {
      document.addEventListener(
        event,
        () => {
          const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')!
          const samples: MotionSample[] = []
          let previous = '',
            stable = 0
          const start = performance.now()
          const frame = () => {
            const transform = viewport.style.transform
            const matrix = new DOMMatrix(transform)
            samples.push({
              time: performance.now() - start,
              x: matrix.e,
              y: matrix.f,
              zoom: matrix.a
            })
            stable = transform === previous ? stable + 1 : 0
            previous = transform
            if ((samples.length > 2 && stable >= 8) || performance.now() - start > 5000)
              resolve(samples)
            else requestAnimationFrame(frame)
          }
          frame()
        },
        { capture: true, once: true }
      )
    })
  }, event)
  await action()
  return page.evaluate(
    () => (window as typeof window & { motionSamples: Promise<MotionSample[]> }).motionSamples
  )
}

function readCanvasTransforms(page: Page) {
  return page.evaluate(() => ({
    viewport: document.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform,
    nodes: [...document.querySelectorAll<HTMLElement>('.react-flow__node')]
      .map((node) => ({ id: node.dataset.id, transform: node.style.transform }))
      .sort((a, b) => a.id!.localeCompare(b.id!))
  }))
}

function readFocusGeometry(page: Page, ids: string[]) {
  return page.evaluate((ids) => {
    const canvas = document.querySelector('.react-flow')!.getBoundingClientRect()
    const surface = document.querySelector('.canvas-surface')!.getBoundingClientRect()
    const left = Math.max(canvas.left, surface.left),
      right = Math.min(canvas.right, surface.right)
    const top = Math.max(canvas.top, surface.top),
      bottom = Math.min(canvas.bottom, surface.bottom)
    const chrome = [...document.querySelectorAll('[data-workbench-canvas-obstruction]')]
      .map((element) => element.getBoundingClientRect())
      .filter(
        (rect) => rect.right > left && rect.left < right && rect.bottom > top && rect.top < bottom
      )
    const safe = {
      left: left + 24,
      right: right - 24,
      top:
        Math.max(
          top,
          ...chrome
            .filter((rect) => (rect.top + rect.bottom) / 2 <= (top + bottom) / 2)
            .map((rect) => rect.bottom)
        ) + 24,
      bottom:
        Math.min(
          bottom,
          ...chrome
            .filter((rect) => (rect.top + rect.bottom) / 2 > (top + bottom) / 2)
            .map((rect) => rect.top)
        ) - 24
    }
    const targets = ids.map((id) =>
      document.querySelector(`.react-flow__node[data-id="${id}"]`)!.getBoundingClientRect()
    )
    const bounds = {
      left: Math.min(...targets.map((rect) => rect.left)),
      right: Math.max(...targets.map((rect) => rect.right)),
      top: Math.min(...targets.map((rect) => rect.top)),
      bottom: Math.max(...targets.map((rect) => rect.bottom))
    }
    return {
      safe,
      bounds,
      centerError: Math.max(
        Math.abs((bounds.left + bounds.right - safe.left - safe.right) / 2),
        Math.abs((bounds.top + bounds.bottom - safe.top - safe.bottom) / 2)
      ),
      overflow: Math.max(
        safe.left - bounds.left,
        bounds.right - safe.right,
        safe.top - bounds.top,
        bounds.bottom - safe.bottom
      )
    }
  }, ids)
}
