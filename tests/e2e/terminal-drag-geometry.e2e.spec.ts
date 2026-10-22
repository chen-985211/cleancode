// @vitest-environment node

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { settle, expectRect, recordEdgeFrames, readGeometry } from '../support/e2eTerminalGeometry'
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
import { setElectronContentSize } from '../support/e2eWindow'
import { createE2eTerminalEnvironment } from '../support/e2eTerminal'

// Real React Flow/D3 input and SVG screen geometry are essential here: mocked
// node changes cannot expose a stale drag subject or stale handle measurements.
describe('terminal drag geometry', () => {
  let page: Page
  let workbench: E2eWorkbench
  let resources: E2eScenarioResources
  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-drag-geometry')
    resources.workbench = workbench
    const app = await launchApp(workbench, { environment: createE2eTerminalEnvironment() })
    resources.electronApp = app
    page = await app.firstWindow()
    resources.page = page
    await setElectronContentSize(app, { width: 2200, height: 1400 })
    await page.waitForFunction(() => innerWidth >= 2200 && innerHeight >= 1400)
  }, electronLaunchTimeoutMs)
  afterEach(async ({ task }) =>
    teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  )

  it.each(['workflow-label', 'title-border'] as const)(
    'saves the intended drag scope at the workflow/title boundary: %s',
    async (origin) => {
      await page.getByRole('button', { name: '添加项目' }).click()
      const registered = await pollUntilState({
        description: 'registered workflow drag project',
        observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
        accept: (items) => items.length === 1,
        timeoutMs: 10000
      })
      const graph = await page.evaluate(async (workbench) => {
        const api = window.cleancode!
        const scope = {
          projectDirectory: workbench.project.directory,
          workspaceId: workbench.graph.workspaceId
        }
        let graph = workbench.graph
        for (const [index, name] of ['Install', 'Serve'].entries())
          graph = await api.createTerminalBlock({
            ...scope,
            name,
            description: '',
            position: { x: 300 + index * 900, y: 500 }
          })
        graph = await api.connectTerminalBlocks({
          ...scope,
          sourceBlockId: graph.blocks[0]!.id,
          targetBlockId: graph.blocks[1]!.id
        })
        await api.updateGraphViewport({ ...scope, viewport: { x: 30, y: 30, zoom: 0.53 } })
        return graph
      }, registered[0]!)
      await page.reload()
      const handle = page.locator('.terminal-workflow-drag-handle')
      await handle.waitFor()
      await settle(page)
      const before = await readE2eBlockGraph(workbench)
      const box = (await handle.boundingBox())!
      const eventTrace = await page.evaluateHandle(() => {
        const events: { type: string; x: number; y: number; title: boolean; workflow: boolean }[] =
          []
        const capture = (event: MouseEvent) => {
          const target = event.target instanceof Element ? event.target : null
          events.push({
            type: event.type,
            x: event.clientX,
            y: event.clientY,
            title: Boolean(target?.closest('.terminal-node__header')),
            workflow: Boolean(target?.closest('.terminal-workflow-drag-handle'))
          })
        }
        window.addEventListener('pointerdown', capture, true)
        window.addEventListener('mousemove', capture, true)
        return {
          stop() {
            window.removeEventListener('pointerdown', capture, true)
            window.removeEventListener('mousemove', capture, true)
            return events
          }
        }
      })
      const header = (await page
        .locator(`[data-terminal-block-id="${graph.blocks[0]!.id}"] .terminal-node__header`)
        .boundingBox())!
      const start =
        origin === 'workflow-label'
          ? { x: box.x + 30, y: box.y + box.height / 2 }
          : { x: header.x + 30, y: header.y + 1 }
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      if (origin === 'title-border') {
        // Cross the drag threshold over the adjacent label. D3's start callback
        // receives this move event, whose target differs from pointer-down.
        await page.mouse.move(box.x + 30, box.y + box.height / 2)
      }
      await page.mouse.move(start.x + 120, start.y + 85, { steps: 12 })
      await page.mouse.up()
      const events = await eventTrace.evaluate((trace) => trace.stop())
      expect(events.find((event) => event.type === 'pointerdown')).toMatchObject({
        title: origin === 'title-border',
        workflow: origin === 'workflow-label'
      })
      if (origin === 'title-border')
        expect(events.some((event) => event.type === 'mousemove' && event.workflow)).toBe(true)
      await mkdir('test-results/terminal-drag-geometry', { recursive: true })
      await writeFile(
        `test-results/terminal-drag-geometry/${origin}-events.json`,
        JSON.stringify(events, null, 2)
      )
      await pollUntilState({
        description: 'released drag coordinates are saved',
        observe: () => readE2eBlockGraph(workbench),
        accept: (value) => value.blocks[0]!.position.x > before.blocks[0]!.position.x + 100,
        timeoutMs: 10000
      })
      await settle(page)
      expect(await page.getByText('无法保存画布布局', { exact: true }).count()).toBe(0)
      const saved = await readE2eBlockGraph(workbench)
      const delta = {
        x: saved.blocks[0]!.position.x - before.blocks[0]!.position.x,
        y: saved.blocks[0]!.position.y - before.blocks[0]!.position.y
      }
      for (const original of before.blocks) {
        const moved = saved.blocks.find((block) => block.id === original.id)!
        const translates = origin === 'workflow-label' || original.id === graph.blocks[0]!.id
        expect(moved.position.x - original.position.x).toBeCloseTo(translates ? delta.x : 0)
        expect(moved.position.y - original.position.y).toBeCloseTo(translates ? delta.y : 0)
      }
      expect(saved.connections).toEqual(graph.connections)
      await page.reload()
      await handle.waitFor()
      await settle(page)
      const geometry = await readGeometry(
        page,
        graph.blocks.map((block) => block.id),
        null,
        graph.connections ?? []
      )
      expect(geometry.maxGap).toBeLessThan(3)
      expect((await readE2eBlockGraph(workbench)).blocks).toEqual(saved.blocks)
      await mkdir('test-results/terminal-drag-geometry', { recursive: true })
      await page.screenshot({
        path: `test-results/terminal-drag-geometry/${origin}-saved.png`
      })
    },
    electronScenarioTimeoutMs
  )

  it.each([
    { zoom: 0.5, expanded: false, reducedMotion: false },
    { zoom: 0.5, expanded: true, reducedMotion: false }
  ])(
    'keeps members and edges attached through release: $zoom, expanded=$expanded, reduced=$reducedMotion',
    async ({ zoom, expanded, reducedMotion }) => {
      await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
      const directory = join('test-results', 'terminal-drag-geometry')
      const scenario = `${zoom}-${expanded ? 'expanded' : 'collapsed'}-${reducedMotion ? 'reduced' : 'animated'}`
      await mkdir(directory, { recursive: true })
      const releaseResults: unknown[] = []
      await page.getByRole('button', { name: '添加项目' }).click()
      const registered = await pollUntilState({
        description: 'registered geometry project',
        observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
        accept: (items) => items.length === 1,
        timeoutMs: 10000
      })
      const graph = await page.evaluate(
        async ({ workbench, zoom, expanded }) => {
          const api = window.cleancode!
          const scope = {
            projectDirectory: workbench.project.directory,
            workspaceId: workbench.graph.workspaceId
          }
          let graph = workbench.graph
          for (const name of ['Install', 'Build', 'Serve', 'Check', 'Compile', 'Preview']) {
            graph = await api.createTerminalBlock({
              ...scope,
              name,
              description: '',
              position: { x: 200, y: 200 }
            })
            const block = graph.blocks.at(-1)!
            graph = await api.resizeTerminalBlock({
              ...scope,
              blockId: block.id,
              position: block.position,
              size: block.size,
              isCollapsed: !(expanded && name === 'Build')
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
            position: { x: 100, y: 250 }
          })
          for (const blockId of [ids[0]!, ids[3]!])
            graph = await api.moveTerminalWorkflowToGroup({
              ...scope,
              blockId,
              targetTerminalGroupId: graph.terminalGroups[0]!.id,
              position: graph.blocks.find((block) => block.id === blockId)!.position,
              scope: 'workflow'
            })
          await api.updateGraphViewport({ ...scope, viewport: { x: 30, y: 30, zoom } })
          return graph
        },
        { workbench: registered[0]!, zoom, expanded }
      )
      await page.reload()
      const groupId = graph.terminalGroups[0]!.id
      const group = page.locator(`[data-terminal-group-id="${groupId}"]`)
      await group.waitFor()
      await settle(page)
      const terminalIds = graph.blocks.map((block) => block.id)
      const connections = graph.connections ?? []
      const sample = () => readGeometry(page, terminalIds, groupId, connections)

      // A selected workflow node must still follow later group drags. Test the
      // middle node from the report as well as both ends of the dependency chain.
      for (const index of [1, 0, 2]) {
        const before = await sample()
        const header = page.locator(
          `[data-terminal-block-id="${terminalIds[index]}"] .terminal-node__header`
        )
        const box = (await header.boundingBox())!
        await page.mouse.move(box.x + 40, box.y + box.height / 2)
        await page.mouse.down()
        const releaseFrames = await recordEdgeFrames(page, connections)
        try {
          await page.mouse.move(box.x + 130, box.y + 95, { steps: 8 })
          const during = await sample()
          expect(
            during.maxGap,
            JSON.stringify({
              during,
              frames: await releaseFrames.evaluate((recorder) => recorder.read())
            })
          ).toBeLessThan(3)
          expect(during.members[index]!.y - before.members[index]!.y).toBeGreaterThan(30)
        } finally {
          await page.mouse.up()
        }
        if (index === 1 && !reducedMotion)
          await page.screenshot({ path: join(directory, `return-${scenario}.png`) })
        await settle(page)
        const release = await releaseFrames.evaluate((recorder) => recorder.stop())
        await releaseFrames.dispose()
        releaseResults.push({ node: index, ...release })
        expect(release.frames).toBeGreaterThan(2)
        expect(release.maxGap, JSON.stringify(release)).toBeLessThan(3)
        const returned = await sample()
        for (let i = 0; i < terminalIds.length; i++)
          expectRect(returned.members[i]!, before.members[i]!)
        expect(returned.maxGap).toBeLessThan(3)

        const persistedBefore = await readE2eBlockGraph(workbench)
        let expectedX = persistedBefore.terminalGroups[0]!.position.x
        const groupHeader = (await group.locator('.terminal-group-node__header').boundingBox())!
        const start = { x: groupHeader.x + 80, y: groupHeader.y + groupHeader.height / 2 }
        await page.mouse.move(start.x, start.y)
        await page.mouse.down()
        try {
          for (const delta of [25, 75, 140]) {
            await page.mouse.move(start.x + delta, start.y + 45, { steps: 5 })
            const during = await sample()
            const dx = during.group!.x - returned.group!.x
            const dy = during.group!.y - returned.group!.y
            expectedX = persistedBefore.terminalGroups[0]!.position.x + dx / zoom
            // D3 starts after the drag threshold; all objects must share the
            // actual group translation, including that initial dead zone.
            expect(dx).toBeGreaterThan(delta - 10)
            for (let i = 0; i < terminalIds.length; i++)
              expectRect(during.members[i]!, {
                ...returned.members[i]!,
                x: returned.members[i]!.x + dx,
                y: returned.members[i]!.y + dy
              })
            expect(during.maxGap).toBeLessThan(3)
          }
        } finally {
          await page.mouse.up()
        }
        await settle(page)
        await pollUntilState({
          description: 'committed group translation',
          observe: () => readE2eBlockGraph(workbench),
          accept: (value) => Math.abs(value.terminalGroups[0]!.position.x - expectedX) < 0.001,
          timeoutMs: 10000
        })
        await settle(page)
        const final = await sample()
        expect(final.maxGap).toBeLessThan(3)
        for (const id of terminalIds)
          expect(
            await page
              .locator(`[data-terminal-block-id="${id}"] .terminal-node`)
              .evaluate((element) => element.hasAttribute('inert'))
          ).toBe(false)
      }
      const saved = await readE2eBlockGraph(workbench)
      expect(saved.connections).toEqual(graph.connections)
      expect(saved.terminalGroups[0]!.memberBlockIds).toEqual(
        graph.terminalGroups[0]!.memberBlockIds
      )
      const beforeReload = await sample()
      await writeFile(
        join(directory, `release-${scenario}.json`),
        JSON.stringify(releaseResults, null, 2)
      )
      await group.screenshot({ path: join(directory, `group-${zoom}.png`) })
      await page.reload()
      await group.waitFor()
      await settle(page)
      const restored = await sample()
      for (let i = 0; i < terminalIds.length; i++)
        expectRect(restored.members[i]!, beforeReload.members[i]!)
      expect(restored.maxGap).toBeLessThan(3)
      await page
        .locator(`[data-terminal-block-id="${terminalIds[0]}"] .terminal-node__disclosure`)
        .click()
      await page.waitForFunction(
        (id) =>
          document
            .querySelector(`[data-terminal-block-id="${id}"] .terminal-node__disclosure`)
            ?.getAttribute('aria-expanded') === 'true',
        terminalIds[0]!
      )
      await settle(page)
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme })
        await page.waitForFunction(
          (theme) => document.documentElement.dataset.theme === theme,
          theme
        )
        const colors = await page.evaluate(
          (ids) =>
            ids
              .slice(0, 2)
              .map(
                (id) =>
                  getComputedStyle(
                    document.querySelector(`[data-terminal-block-id="${id}"] .terminal-node__icon`)!
                  ).color
              ),
          terminalIds
        )
        expect(colors[0]).toBe(colors[1])
        await group.screenshot({ path: join(directory, `icons-${theme}-${zoom}.png`) })
      }

      // The same workflow nodes outside a combination keep the released
      // coordinates. Verify the real command, persistence and reload boundary.
      await page.evaluate(
        async ({ workbench, groupId, zoom }) => {
          await window.cleancode!.dissolveTerminalGroup({
            projectDirectory: workbench.project.directory,
            workspaceId: workbench.graph.workspaceId,
            terminalGroupId: groupId
          })
          // Keep the enlarged workflow away from edge-triggered auto-pan so
          // this scenario measures node movement with a fixed camera.
          await window.cleancode!.updateGraphViewport({
            projectDirectory: workbench.project.directory,
            workspaceId: workbench.graph.workspaceId,
            viewport: { x: -350, y: 0, zoom }
          })
        },
        { workbench: registered[0]!, groupId, zoom }
      )
      await page.reload()
      await group.waitFor({ state: 'detached' })
      await page.locator(`[data-terminal-block-id="${terminalIds[0]}"]`).waitFor()
      await settle(page)
      for (const index of [1, 0, 2]) {
        const before = await readGeometry(page, terminalIds, null, connections)
        const persisted = await readE2eBlockGraph(workbench)
        const id = terminalIds[index]!
        const header = await page
          .locator(`[data-terminal-block-id="${id}"] .terminal-node__header`)
          .boundingBox()
        await page.mouse.move(header!.x + 40, header!.y + header!.height / 2)
        await page.mouse.down()
        await page.mouse.move(header!.x + 85, header!.y + 90, { steps: 8 })
        const held = await readGeometry(page, terminalIds, null, connections)
        await page.mouse.up()
        const original = persisted.blocks.find((block) => block.id === id)!
        const expected = {
          x: original.position.x + (held.members[index]!.x - before.members[index]!.x) / zoom,
          y: original.position.y + (held.members[index]!.y - before.members[index]!.y) / zoom
        }
        expect(held.members[index]!.y - before.members[index]!.y).toBeGreaterThan(30)
        await pollUntilState({
          description: 'ungrouped workflow terminal keeps released coordinates',
          observe: () => readE2eBlockGraph(workbench),
          accept: (value) => {
            const position = value.blocks.find((block) => block.id === id)!.position
            return (
              Math.abs(position.x - expected.x) < 0.01 && Math.abs(position.y - expected.y) < 0.01
            )
          },
          timeoutMs: 10000
        })
        await settle(page)
        const released = await readGeometry(page, terminalIds, null, connections)
        expectRect(released.members[index]!, held.members[index]!)
        for (let sibling = 0; sibling < terminalIds.length; sibling++)
          if (sibling !== index) expectRect(released.members[sibling]!, before.members[sibling]!)
        expect(released.maxGap).toBeLessThan(3)
      }
      const freeLayout = await readGeometry(page, terminalIds, null, connections)
      await page.reload()
      await page.locator(`[data-terminal-block-id="${terminalIds[0]}"]`).waitFor()
      await settle(page)
      const restoredFreeLayout = await readGeometry(page, terminalIds, null, connections)
      for (let i = 0; i < terminalIds.length; i++)
        expectRect(restoredFreeLayout.members[i]!, freeLayout.members[i]!)
      expect(restoredFreeLayout.maxGap).toBeLessThan(3)
      expect((await readE2eBlockGraph(workbench)).connections).toEqual(graph.connections)
      await page.screenshot({ path: join(directory, `outside-${scenario}.png`) })
    },
    electronScenarioTimeoutMs * 2
  )
})
