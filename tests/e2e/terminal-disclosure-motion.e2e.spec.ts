// @vitest-environment node

import { mkdir, writeFile } from 'node:fs/promises'
import type { Page } from 'playwright'
import {
  createE2eWorkbench,
  launchApp,
  teardownE2eScenario,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  type E2eScenarioResources
} from '../support/e2eWorkbench'
import { createE2eTerminalEnvironment } from '../support/e2eTerminal'
import { pollUntilState } from '../support/e2ePolling'
import { settle } from '../support/e2eTerminalGeometry'

describe('terminal disclosure presentation', () => {
  let page: Page
  let resources: E2eScenarioResources
  beforeEach(async () => {
    resources = {}
    const workbench = await createE2eWorkbench('cleancode-disclosure-motion')
    resources.workbench = workbench
    const app = await launchApp(workbench, { environment: createE2eTerminalEnvironment() })
    resources.electronApp = app
    page = await app.firstWindow()
    resources.page = page
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(2200, 1400)
    )
    await page.waitForFunction(() => innerWidth >= 2200 && innerHeight >= 1400)
    await mkdir('test-results/terminal-disclosure-motion', { recursive: true })
  }, electronLaunchTimeoutMs)
  afterEach(async ({ task }) =>
    teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  )

  it.each([0.65, 1.6])(
    'keeps visible ports on their animated shells through disclosure at zoom %s',
    async (zoom) => {
      await page.emulateMedia({ colorScheme: zoom === 1.6 ? 'dark' : 'light' })
      await page.getByRole('button', { name: '添加项目' }).click()
      const entries = await pollUntilState({
        description: 'registered disclosure motion project',
        observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
        accept: (entries) => entries.length === 1,
        timeoutMs: 10000
      })
      const graph = await page.evaluate(
        async ({ entry, zoom }) => {
          const api = window.cleancode!
          const scope = {
            projectDirectory: entry.project.directory,
            workspaceId: entry.graph.workspaceId
          }
          let graph = entry.graph
          for (let i = 0; i < 6; i++) {
            graph = await api.createTerminalBlock({
              ...scope,
              name: `Step ${i}`,
              description: '',
              position: { x: 200, y: 250 }
            })
            const block = graph.blocks.at(-1)!
            graph = await api.resizeTerminalBlock({
              ...scope,
              blockId: block.id,
              position: block.position,
              size: block.size,
              isCollapsed: true
            })
          }
          for (const [source, target] of [
            [0, 1],
            [1, 2],
            [3, 4],
            [4, 5]
          ])
            graph = await api.connectTerminalBlocks({
              ...scope,
              sourceBlockId: graph.blocks[source!]!.id,
              targetBlockId: graph.blocks[target!]!.id
            })
          graph = await api.createTerminalGroup({
            ...scope,
            name: 'Application',
            position: { x: 50, y: 180 }
          })
          for (const index of [0, 3])
            graph = await api.moveTerminalWorkflowToGroup({
              ...scope,
              blockId: graph.blocks[index]!.id,
              targetTerminalGroupId: graph.terminalGroups[0]!.id,
              scope: 'workflow',
              position: graph.blocks[index]!.position
            })
          await api.updateGraphViewport({ ...scope, viewport: { x: 20, y: 20, zoom } })
          return graph
        },
        { entry: entries[0]!, zoom }
      )
      await page.reload()
      const ids = graph.blocks.map((block) => block.id)
      const terminalToggle = (id: string) =>
        page.locator(`[data-terminal-block-id="${id}"] .terminal-node__disclosure`)
      const groupToggle = page.locator(
        `[data-terminal-group-id="${graph.terminalGroups[0]!.id}"] .terminal-group-node__disclosure`
      )
      await terminalToggle(ids[0]!).waitFor()
      await settle(page)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Profiler.enable')
      await cdp.send('Profiler.start')
      const results: unknown[] = []
      let maxGap = 0,
        maxOrphanOpacity = 0,
        maxHiddenGroupPortOpacity = 0,
        midMotionInitializations = 0
      const measure = async (name: string, action: () => Promise<void>) => {
        const recorder = await recordPresentation(page, ids)
        await action()
        await settle(page)
        const metrics = await recorder.evaluate((recorder) => recorder.stop())
        await recorder.dispose()
        results.push({ name, ...metrics })
        if (name === 'cold-expand') {
          expect(metrics.newViewCount).toBe(1)
          expect(metrics.viewsBeforeShellFeedback).toBe(0)
        }
        if (name === 'warm-expand') expect(metrics.newViewCount).toBe(0)
        maxGap = Math.max(maxGap, metrics.maxGap)
        maxOrphanOpacity = Math.max(maxOrphanOpacity, metrics.maxOrphanOpacity)
        maxHiddenGroupPortOpacity = Math.max(
          maxHiddenGroupPortOpacity,
          metrics.maxHiddenGroupPortOpacity
        )
        midMotionInitializations += metrics.midMotionInitializations
      }
      const toggleTerminal = async (id: string, expanded: boolean, pointer = false) => {
        if (pointer) await terminalToggle(id).click()
        else await terminalToggle(id).press('Space')
        await page.waitForFunction(
          ({ id, expanded }) =>
            document
              .querySelector(`[data-terminal-block-id="${id}"] .terminal-node__disclosure`)
              ?.getAttribute('aria-expanded') === String(expanded),
          { id, expanded }
        )
      }
      const toggleGroup = async (expanded: boolean) => {
        await groupToggle.press('Space')
        await page.waitForFunction(
          ({ id, expanded }) =>
            document
              .querySelector(`[data-terminal-group-id="${id}"] .terminal-group-node__disclosure`)
              ?.getAttribute('aria-expanded') === String(expanded),
          { id: graph.terminalGroups[0]!.id, expanded }
        )
      }
      try {
        await measure('cold-expand', () => toggleTerminal(ids[0]!, true, true))
        await measure('collapse', () => toggleTerminal(ids[0]!, false))
        await measure('warm-expand', () => toggleTerminal(ids[0]!, true, true))
        for (const id of ids.slice(1))
          await measure(`expand-${ids.indexOf(id)}`, () => toggleTerminal(id, true))
        for (const expanded of [false, true, false, true]) {
          await measure(`group-${expanded ? 'expand' : 'collapse'}`, () => toggleGroup(expanded))
        }
        await measure('terminal-reversal', async () => {
          await toggleTerminal(ids[0]!, false)
          await page.waitForFunction((id) => {
            const shell = document.querySelector(`[data-terminal-block-id="${id}"] .terminal-node`)!
            return shell.classList.contains('workbench-object-motion--spatial')
          }, ids[0]!)
          await toggleTerminal(ids[0]!, true)
        })
        await measure('group-reversal', async () => {
          await toggleGroup(false)
          await page.waitForFunction(() =>
            document.querySelector('.terminal-node.workbench-object-motion--group-collapse')
          )
          await page.screenshot({
            path: `test-results/terminal-disclosure-motion/moving-${zoom}.png`
          })
          await toggleGroup(true)
        })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await measure('reduced-motion', async () => {
          await toggleTerminal(ids[0]!, false)
          await toggleTerminal(ids[0]!, true)
          await toggleGroup(false)
          await toggleGroup(true)
        })
        await page.screenshot({
          path: `test-results/terminal-disclosure-motion/settled-${zoom}.png`
        })
      } finally {
        const { profile } = await cdp.send('Profiler.stop')
        await cdp.detach()
        await writeFile(
          `test-results/terminal-disclosure-motion/profile-${zoom}.json`,
          JSON.stringify(profile)
        )
        await writeFile(
          `test-results/terminal-disclosure-motion/metrics-${zoom}.json`,
          JSON.stringify(results, null, 2)
        )
      }
      expect(maxGap, JSON.stringify(results)).toBeLessThan(2)
      expect(maxOrphanOpacity, JSON.stringify(results)).toBeLessThan(0.03)
      expect(maxHiddenGroupPortOpacity, JSON.stringify(results)).toBe(0)
      expect(midMotionInitializations, JSON.stringify(results)).toBe(0)
    },
    electronScenarioTimeoutMs
  )
})

async function recordPresentation(page: Page, ids: string[]) {
  return page.evaluateHandle((ids) => {
    let frame = 0,
      previous = performance.now(),
      maxGap = 0,
      maxOrphanOpacity = 0,
      maxHiddenGroupPortOpacity = 0,
      midMotionInitializations = 0
    const creationGeometry: unknown[] = []
    let newViewCount = 0,
      viewsBeforeShellFeedback = 0
    const knownViews = new WeakSet(document.querySelectorAll('.xterm'))
    const initialHeights = new Map(
      ids.map((id) => [
        id,
        document
          .querySelector(`[data-terminal-block-id="${id}"] .terminal-node`)!
          .getBoundingClientRect().height
      ])
    )
    const initializationObserver = new MutationObserver((records) => {
      for (const view of document.querySelectorAll('.xterm')) {
        if (knownViews.has(view)) continue
        knownViews.add(view)
        const root = view.closest<HTMLElement>('[data-terminal-block-id]')
        const id = root?.dataset.terminalBlockId
        if (!id || !initialHeights.has(id)) continue
        newViewCount++
        creationGeometry.push({
          time: performance.now(),
          initial: initialHeights.get(id),
          actual: root!.querySelector('.terminal-node')!.getBoundingClientRect().height,
          style: root!.querySelector('.terminal-node')!.getAttribute('style'),
          classes: root!.querySelector('.terminal-node')!.className
        })
        if (
          Math.abs(
            root!.querySelector('.terminal-node')!.getBoundingClientRect().height -
              initialHeights.get(id)!
          ) < 0.5
        )
          viewsBeforeShellFeedback++
      }
      for (const record of records) {
        if (
          (record.target as HTMLElement).dataset.terminalRendererReady === 'true' &&
          document.querySelector('.workbench-object-motion--spatial')
        )
          midMotionInitializations++
      }
    })
    initializationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-terminal-renderer-ready']
    })
    const frames: number[] = []
    const longTasks: number[] = []
    const observer = new PerformanceObserver((list) =>
      longTasks.push(...list.getEntries().map((entry) => entry.duration))
    )
    observer.observe({ type: 'longtask' })
    const channel = new MessageChannel()
    const visible = (element: Element) => {
      let opacity = 1
      let current: Element | null = element
      while (current) {
        const style = getComputedStyle(current)
        if (style.visibility === 'hidden' || style.display === 'none') return 0
        opacity *= Number(style.opacity)
        current = current.parentElement
      }
      return opacity
    }
    channel.port1.onmessage = () => {
      for (const port of document.querySelectorAll(
        '.terminal-group-node > .terminal-node__handle'
      )) {
        maxHiddenGroupPortOpacity = Math.max(maxHiddenGroupPortOpacity, visible(port))
      }
      for (const id of ids) {
        const root = document.querySelector(`[data-terminal-block-id="${id}"]`)!
        const shell = root.querySelector('.terminal-node')!
        const bounds = shell.getBoundingClientRect()
        const shellOpacity = visible(shell)
        for (const side of ['input', 'output']) {
          const port = root.querySelector(`.terminal-node__handle--${side}`)!
          const opacity = visible(port)
          maxOrphanOpacity = Math.max(maxOrphanOpacity, opacity - shellOpacity)
          if (opacity < 0.01) continue
          const rect = port.getBoundingClientRect()
          maxGap = Math.max(
            maxGap,
            Math.hypot(
              rect.x + rect.width / 2 - (side === 'input' ? bounds.left : bounds.right),
              rect.y + rect.height / 2 - bounds.y - bounds.height / 2
            )
          )
        }
      }
      frame = requestAnimationFrame(tick)
    }
    const tick = (now: number) => {
      frames.push(now - previous)
      previous = now
      channel.port2.postMessage(null)
    }
    frame = requestAnimationFrame(tick)
    return {
      stop() {
        cancelAnimationFrame(frame)
        channel.port1.close()
        channel.port2.close()
        observer.disconnect()
        initializationObserver.disconnect()
        const sorted = [...frames].sort((a, b) => a - b)
        return {
          frames: frames.length,
          p95: sorted[Math.floor(sorted.length * 0.95)],
          maximum: Math.max(...frames),
          longTasks,
          maxGap,
          maxOrphanOpacity,
          maxHiddenGroupPortOpacity,
          midMotionInitializations,
          newViewCount,
          viewsBeforeShellFeedback,
          creationGeometry
        }
      }
    }
  }, ids)
}
