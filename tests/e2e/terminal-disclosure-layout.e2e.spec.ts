// @vitest-environment node

import type { ElectronApplication, Page } from 'playwright'
import {
  createE2eWorkbench,
  launchApp,
  teardownE2eScenario,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  type E2eScenarioResources
} from '../support/e2eWorkbench'
import { pollUntilState } from '../support/e2ePolling'
import { createE2eTerminalEnvironment } from '../support/e2eTerminal'

describe('terminal disclosure flow rows', () => {
  let app: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources
  beforeEach(async () => {
    resources = {}
    const workbench = await createE2eWorkbench('cleancode-disclosure-layout')
    resources.workbench = workbench
    app = await launchApp(workbench, { environment: createE2eTerminalEnvironment() })
    resources.electronApp = app
    page = await app.firstWindow()
    resources.page = page
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(2200, 1400)
    )
    await page.waitForFunction(() => innerWidth >= 2200 && innerHeight >= 1400)
  }, electronLaunchTimeoutMs)
  afterEach(async ({ task }) =>
    teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  )

  it(
    'uses canonical slots from creation and keeps every visible frame clear during cross-node reversals',
    async () => {
      await page.getByRole('button', { name: '添加项目' }).click()
      const workbenches = await pollUntilState({
        description: 'registered disclosure project',
        observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
        accept: (items) => items.length === 1,
        timeoutMs: 10000
      })
      const setup = await page.evaluate(async (workbench) => {
        const api = window.cleancode!
        const scope = {
          projectDirectory: workbench.project.directory,
          workspaceId: workbench.graph.workspaceId
        }
        let graph = workbench.graph
        for (let i = 0; i < 6; i++) {
          graph = await api.createTerminalBlock({
            ...scope,
            name: `Step ${i}`,
            description: '',
            position: { x: 700 - i * 40, y: 350 + i * 10 }
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
        const ids = graph.blocks.map((block) => block.id)
        for (const [source, target] of [
          [0, 1],
          [1, 2],
          [3, 4],
          [4, 5]
        ])
          graph = await api.connectTerminalBlocks({
            ...scope,
            sourceBlockId: ids[source!]!,
            targetBlockId: ids[target!]!
          })
        graph = await api.createTerminalGroup({
          ...scope,
          name: 'Application',
          position: { x: 200, y: 250 }
        })
        for (const index of [0, 3])
          graph = await api.moveTerminalWorkflowToGroup({
            ...scope,
            blockId: ids[index]!,
            targetTerminalGroupId: graph.terminalGroups[0]!.id,
            position: graph.blocks.find((block) => block.id === ids[index])!.position,
            scope: 'workflow'
          })
        await api.updateGraphViewport({ ...scope, viewport: { x: 40, y: 30, zoom: 0.8 } })
        return { terminals: ids, connections: graph.connections ?? [] }
      }, workbenches[0]!)
      const ids = setup.terminals
      await page.reload()
      const disclosure = (index: number) =>
        page.locator(`[data-terminal-block-id="${ids[index]}"] .terminal-node__disclosure`)
      await disclosure(5).waitFor()
      const settle = () =>
        page.waitForFunction(() => !document.querySelector('.workbench-object-motion--spatial'))
      await settle()
      const boxes = () =>
        page.evaluate(
          (ids) =>
            ids.map((id) => {
              const r = document
                .querySelector(`[data-terminal-block-id="${id}"] .terminal-node`)!
                .getBoundingClientRect()
              return { x: r.x, y: r.y, width: r.width, height: r.height }
            }),
          ids
        )
      const initial = await boxes()
      expect(initial[0]!.x).toBeCloseTo(initial[3]!.x, 1)
      const recorder = await page.evaluateHandle(
        ({ ids, connections }) => {
          const overlaps: unknown[] = []
          let frame = 0,
            frames = 0,
            curvedFrames = 0,
            maxAttachmentGap = 0
          const tick = () => {
            const rects = ids.map((id) =>
              document
                .querySelector(`[data-terminal-block-id="${id}"] .terminal-node`)!
                .getBoundingClientRect()
            )
            frames++
            for (let i = 0; i < rects.length; i++)
              for (let j = i + 1; j < rects.length; j++) {
                const a = rects[i]!,
                  b = rects[j]!
                const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
                const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
                if (width > 2 && height > 2 && overlaps.length < 5)
                  overlaps.push({ i, j, width, height })
              }
            for (const connection of connections) {
              const source = ids.indexOf(connection.sourceBlockId),
                target = ids.indexOf(connection.targetBlockId)
              const actual = document.querySelector<SVGPathElement>(
                `.react-flow__edge[data-id="${connection.id}"] .react-flow__edge-path`
              )
              if (!actual) continue
              const matrix = actual.getScreenCTM()!
              const start = actual.getPointAtLength(0),
                end = actual.getPointAtLength(actual.getTotalLength())
              const from = new DOMPoint(start.x, start.y).matrixTransform(matrix),
                to = new DOMPoint(end.x, end.y).matrixTransform(matrix)
              const a = rects[source!]!,
                b = rects[target!]!
              maxAttachmentGap = Math.max(
                maxAttachmentGap,
                Math.hypot(from.x - a.right, from.y - a.y - a.height / 2),
                Math.hypot(to.x - b.left, to.y - b.y - b.height / 2)
              )
              if (Math.abs(from.y - to.y) > 10 && actual.getAttribute('d')?.includes('C'))
                curvedFrames++
            }
            frame = requestAnimationFrame(tick)
          }
          frame = requestAnimationFrame(tick)
          return {
            stop() {
              cancelAnimationFrame(frame)
              return { overlaps, frames, curvedFrames, maxAttachmentGap }
            }
          }
        },
        { ids, connections: setup.connections }
      )
      try {
        await disclosure(4).press('Space')
        await page.waitForFunction(
          (id) =>
            document
              .querySelector(`[data-terminal-block-id="${id}"] .terminal-node__disclosure`)
              ?.getAttribute('aria-expanded') === 'true',
          ids[4]!
        )
        await settle()
        const expanded = await boxes()
        for (let i = 0; i < 6; i++) {
          expect(expanded[i]!.y).toBeCloseTo(expanded[Math.floor(i / 3) * 3]!.y, 1)
          if (i < 5) expect(expanded[i]!.x).toBeCloseTo(initial[i]!.x, 1)
        }
        expect(expanded[4]!.width).toBeCloseTo(420 * 0.8, 1)
        expect(expanded[4]!.height).toBeCloseTo(280 * 0.8, 1)
        await disclosure(4).press('Space')
        await page.waitForFunction(
          (id) =>
            document
              .querySelector(`[data-terminal-block-id="${id}"] .terminal-node__disclosure`)
              ?.getAttribute('aria-expanded') === 'false',
          ids[4]!
        )
        await settle()
        const states = Array.from({ length: 6 }, () => false)
        for (const index of [0, 1, 0, 4, 1, 3, 4, 2, 5, 2, 3, 5]) {
          states[index] = !states[index]
          await disclosure(index).press('Space')
          await page.waitForFunction(
            ({ id, expanded }) =>
              document
                .querySelector(`[data-terminal-block-id="${id}"] .terminal-node__disclosure`)
                ?.getAttribute('aria-expanded') === String(expanded),
            { id: ids[index]!, expanded: states[index] }
          )
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
              )
          )
        }
        await settle()
        const samples = await recorder.evaluate((recorder) => recorder.stop())
        expect(samples.frames).toBeGreaterThan(10)
        expect(samples.overlaps).toEqual([])
        expect(samples.curvedFrames).toBeGreaterThan(0)
        expect(samples.maxAttachmentGap).toBeLessThan(5)
        const final = await boxes()
        for (let i = 0; i < 6; i++)
          for (const key of ['x', 'y', 'width', 'height'] as const)
            expect(final[i]![key]).toBeCloseTo(initial[i]![key], 1)
        await page.reload()
        await disclosure(5).waitFor()
        await settle()
        expect(await boxes()).toEqual(final)
      } finally {
        await recorder.evaluate((recorder) => recorder.stop()).catch(() => undefined)
        await recorder.dispose()
      }
    },
    electronScenarioTimeoutMs
  )
})
