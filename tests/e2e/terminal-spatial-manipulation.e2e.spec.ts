// @vitest-environment node

import { mkdir } from 'node:fs/promises'
import type { Page } from 'playwright'
import {
  createE2eWorkbench,
  launchApp,
  teardownE2eScenario,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { readE2eBlockGraph } from '../support/e2eBlockGraph'
import { pollUntilState } from '../support/e2ePolling'
import { createE2eTerminalEnvironment } from '../support/e2eTerminal'
import { settle, readGeometry, expectRect, recordEdgeFrames } from '../support/e2eTerminalGeometry'

describe('terminal spatial manipulation', () => {
  let page: Page
  let workbench: E2eWorkbench
  let resources: E2eScenarioResources
  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-spatial')
    resources.workbench = workbench
    const app = await launchApp(workbench, { environment: createE2eTerminalEnvironment() })
    resources.electronApp = app
    page = await app.firstWindow()
    resources.page = page
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(2200, 1400)
    )
    await page.waitForFunction(() => innerWidth >= 2200 && innerHeight >= 1400)
    await mkdir('test-results/terminal-spatial', { recursive: true })
  }, electronLaunchTimeoutMs)
  afterEach(async ({ task }) =>
    teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  )

  async function prepare(grouped: boolean, zoom: number) {
    await page.getByRole('button', { name: '添加项目' }).click()
    const registered = await pollUntilState({
      description: 'registered spatial manipulation project',
      observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
      accept: (items) => items.length === 1,
      timeoutMs: 10000
    })
    const graph = await page.evaluate(
      async ({ entry, grouped, zoom }) => {
        const api = window.cleancode!
        const scope = {
          projectDirectory: entry.project.directory,
          workspaceId: entry.graph.workspaceId
        }
        let graph = entry.graph
        for (const [index, name] of ['Install', 'Serve'].entries())
          graph = await api.createTerminalBlock({
            ...scope,
            name,
            description: '',
            position: { x: 200 + index * 650, y: 500 }
          })
        graph = await api.connectTerminalBlocks({
          ...scope,
          sourceBlockId: graph.blocks[0]!.id,
          targetBlockId: graph.blocks[1]!.id
        })
        if (grouped) {
          graph = await api.createTerminalGroup({
            ...scope,
            name: 'Application',
            position: { x: 150, y: 450 }
          })
          graph = await api.moveTerminalWorkflowToGroup({
            ...scope,
            blockId: graph.blocks[0]!.id,
            targetTerminalGroupId: graph.terminalGroups[0]!.id,
            scope: 'workflow',
            position: graph.blocks[0]!.position
          })
        }
        await api.updateGraphViewport({ ...scope, viewport: { x: 30, y: 30, zoom } })
        return graph
      },
      { entry: registered[0]!, grouped, zoom }
    )
    await page.reload()
    await page.locator('.terminal-workflow-drag-handle').waitFor()
    await settle(page)
    return graph
  }

  it.each([
    { grouped: false, zoom: 1 },
    { grouped: true, zoom: 0.5 }
  ])(
    'keeps resize edges joined to ports and resets workflow size on reopen: $grouped / $zoom',
    async ({ grouped, zoom }) => {
      const graph = await prepare(grouped, zoom)
      const ids = graph.blocks.map((block) => block.id)
      const sample = () =>
        readGeometry(page, ids, graph.terminalGroups[0]?.id ?? null, graph.connections ?? [])
      expect(graph.blocks.map((block) => block.size)).toEqual([
        { width: 420, height: 280 },
        { width: 420, height: 280 }
      ])
      for (const [index, corner, dx, dy] of [
        [0, 'bottom.right', 90, 60],
        [1, 'top.left', -45, -30]
      ] as const) {
        const before = await sample()
        let heldWidth = before.members[index]!.width
        const resize = page.locator(
          `[data-terminal-block-id="${ids[index]}"] .react-flow__resize-control.${corner}`
        )
        const box = (await resize.boundingBox())!
        const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        await page.mouse.move(start.x, start.y)
        await page.mouse.down()
        const frames = await recordEdgeFrames(page, graph.connections ?? [])
        try {
          for (const fraction of [0.3, 0.65, 1]) {
            await page.mouse.move(start.x + dx * fraction, start.y + dy * fraction, { steps: 5 })
            const held = await sample()
            heldWidth = held.members[index]!.width
            if (before.group) expect(held.group!.x).toBeCloseTo(before.group.x, 0)
            if (before.group) expect(held.group!.y).toBeCloseTo(before.group.y, 0)
            expect(held.members[index]!.width).toBeGreaterThan(before.members[index]!.width + 5)
            expect(held.maxGap).toBeLessThan(3)
          }
        } finally {
          await page.mouse.up()
        }
        await pollUntilState({
          description: 'resized member dimensions committed',
          observe: () => readE2eBlockGraph(workbench),
          accept: (value) =>
            value.blocks.find((block) => block.id === ids[index])!.size.width ===
            Math.round(heldWidth / zoom),
          timeoutMs: 10000
        })
        if (grouped)
          await pollUntilState({
            description: 'resized group member slots projected without overlap',
            observe: sample,
            accept: (value) =>
              value.members[1]!.x - value.members[0]!.x - value.members[0]!.width > 10,
            timeoutMs: 10000
          })
        await settle(page)
        const placed = await sample()
        if (before.group) {
          expect(placed.group!.x).toBeCloseTo(before.group.x, 0)
          expect(placed.group!.y).toBeCloseTo(before.group.y, 0)
          expect(
            placed.members[1]!.x - placed.members[0]!.x - placed.members[0]!.width
          ).toBeGreaterThan(10)
        }
        const history = await frames.evaluate((recorder) => recorder.stop())
        await frames.dispose()
        expect(history.maxGap, JSON.stringify(history)).toBeLessThan(3)
      }
      const markerTips = await page
        .locator('.terminal-workflow-edge marker')
        .evaluateAll((markers) =>
          markers.map((marker) => {
            const arrow = marker.querySelector('polygon') as SVGPolygonElement
            return {
              offset: Number(marker.getAttribute('refX')) - arrow.getBBox().width,
              orientation: marker.getAttribute('orient')
            }
          })
        )
      expect(markerTips).toEqual([{ offset: 0, orientation: 'auto' }])
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme })
        await page.waitForFunction(
          (theme) => document.documentElement.dataset.theme === theme,
          theme
        )
        await page.screenshot({
          path: `test-results/terminal-spatial/resize-${grouped}-${theme}.png`
        })
      }
      const saved = await readE2eBlockGraph(workbench)
      await page.reload()
      await page.locator('.terminal-workflow-drag-handle').waitFor()
      await settle(page)
      expect((await sample()).maxGap).toBeLessThan(3)
      expect((await readE2eBlockGraph(workbench)).blocks).toEqual(saved.blocks)
      for (const collapsed of [true, false]) {
        for (const id of ids) {
          await page
            .locator(`[data-terminal-block-id="${id}"] .terminal-node__disclosure`)
            .press('Space')
          await pollUntilState({
            description: `terminal disclosure persisted: ${collapsed}`,
            observe: () => readE2eBlockGraph(workbench),
            accept: (value) =>
              value.blocks.find((block) => block.id === id)!.isCollapsed === collapsed,
            timeoutMs: 10000
          })
          await page.waitForFunction(
            ({ id, collapsed }) =>
              document
                .querySelector(`[data-terminal-block-id="${id}"] .terminal-node__disclosure`)
                ?.getAttribute('aria-expanded') === String(!collapsed),
            { id, collapsed }
          )
          await settle(page)
        }
        const geometry = await sample()
        for (const member of geometry.members) {
          expect(member.width).toBeCloseTo((collapsed ? 220 : 420) * zoom, 0)
          expect(member.height).toBeCloseTo((collapsed ? 44 : 280) * zoom, 0)
        }
        expect(geometry.maxGap).toBeLessThan(3)
      }
      expect((await readE2eBlockGraph(workbench)).blocks.map((block) => block.size)).toEqual([
        { width: 420, height: 280 },
        { width: 420, height: 280 }
      ])
      await page.screenshot({ path: `test-results/terminal-spatial/reopened-${grouped}.png` })
    },
    electronScenarioTimeoutMs
  )

  // Curve direction and marker/port joins are parameterized in
  // terminal-dependency-edge.spec.tsx; resize above retains real SVG attachment coverage.
  it(
    'pans a workflow at the edge without losing the pointer grab, and keeps the released camera',
    async () => {
      const graph = await prepare(false, 0.5)
      const label = page.locator('.terminal-workflow-drag-handle')
      const box = (await label.boundingBox())!
      const canvas = (await page.locator('.react-flow').boundingBox())!
      const start = { x: box.x + 30, y: box.y + box.height / 2 }
      const end = { x: canvas.x + canvas.width - 8, y: start.y + 70 }
      const before = await label.boundingBox()
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      await page.mouse.move(end.x, end.y, { steps: 12 })
      const transform = await page.locator('.react-flow__viewport').getAttribute('style')
      await page.waitForFunction(
        (style) => document.querySelector('.react-flow__viewport')?.getAttribute('style') !== style,
        transform
      )
      const held = (await label.boundingBox())!
      expect(held.x - before!.x).toBeCloseTo(end.x - start.x, 0)
      expect(held.y - before!.y).toBeCloseTo(end.y - start.y, 0)
      await page.mouse.up()
      await settle(page)
      const released = (await label.boundingBox())!
      expectRect(released, held)
      const saved = await pollUntilState({
        description: 'workflow edge pan and layout persisted',
        observe: () => readE2eBlockGraph(workbench),
        accept: (value) =>
          value.viewport.x < 30 && value.blocks[0]!.position.x > graph.blocks[0]!.position.x + 100,
        timeoutMs: 10000
      })
      expect(saved.blocks[1]!.position.x - saved.blocks[0]!.position.x).toBeCloseTo(
        graph.blocks[1]!.position.x - graph.blocks[0]!.position.x
      )
      await page.screenshot({ path: 'test-results/terminal-spatial/workflow-autopan.png' })
    },
    electronScenarioTimeoutMs
  )

  it.each([0.53])(
    'moves a group as one fixed space without a release rebound at zoom %s',
    async (zoom) => {
      const graph = await prepare(true, zoom)
      const ids = graph.blocks.map((block) => block.id)
      const groupId = graph.terminalGroups[0]!.id
      const sample = () => readGeometry(page, ids, groupId, graph.connections ?? [])
      for (const displacement of [80, -65, 100]) {
        const before = await sample()
        const header = (await page
          .locator(`[data-terminal-group-id="${groupId}"] .terminal-group-node__header`)
          .boundingBox())!
        const start = { x: header.x + 60, y: header.y + header.height / 2 }
        await page.mouse.move(start.x, start.y)
        await page.mouse.down()
        await page.mouse.move(start.x + displacement, start.y + 50, { steps: 8 })
        const held = await sample()
        const dx = held.group!.x - before.group!.x,
          dy = held.group!.y - before.group!.y
        held.members.forEach((member, index) =>
          expectRect(member, {
            ...before.members[index]!,
            x: before.members[index]!.x + dx,
            y: before.members[index]!.y + dy
          })
        )
        await page.mouse.up()
        // Every frame through the save acknowledgement must retain the released
        // shell and offsets, not merely end at the right coordinates after a spring.
        for (let frame = 0; frame < 12; frame++) {
          await page.evaluate(
            () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          )
          const released = await sample()
          expectRect(released.group!, held.group!)
          released.members.forEach((member, index) => expectRect(member, held.members[index]!))
          expect(released.maxGap).toBeLessThan(3)
        }
        await settle(page)
      }
      await page.screenshot({ path: `test-results/terminal-spatial/group-${zoom}.png` })
      const released = await sample()
      await page.reload()
      await page.locator('.terminal-workflow-drag-handle').waitFor()
      await settle(page)
      const restored = await sample()
      expectRect(restored.group!, released.group!)
      restored.members.forEach((member, index) => expectRect(member, released.members[index]!))
    },
    electronScenarioTimeoutMs
  )
})
