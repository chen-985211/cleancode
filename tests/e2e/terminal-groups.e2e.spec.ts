// @vitest-environment node

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from 'playwright'
import type { BlockGraphSnapshot } from '../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { readE2eBlockGraph } from '../support/e2eBlockGraph'
import { ensureTerminalDomRenderer } from '../support/terminalSelectionE2e'
import { pollUntilState } from '../support/e2ePolling'
import {
  asE2eTerminalInput,
  createE2ePrintCommand,
  createE2eTerminalEnvironment,
  readTerminalSessionId,
  waitForTerminalOutput,
  waitForTerminalShellReady,
  writeTerminalCommand
} from '../support/e2eTerminal'

// Real Electron is needed for D3 title dragging, pointer-captured workflow dragging,
// xterm surface continuity, IPC membership transactions and persisted recovery.
// Hysteresis, cancellation variants and scope matrices live in unit/contract tests.
describe('terminal group direct manipulation', () => {
  let workbench: E2eWorkbench
  let app: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources
  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-terminal-group-drag')
    resources.workbench = workbench
    app = await launchApp(workbench, { environment: createE2eTerminalEnvironment() })
    resources.electronApp = app
    page = await app.firstWindow()
    resources.page = page
    await page.waitForLoadState('domcontentloaded')
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(2400, 1500)
    )
    await page.waitForFunction(() => innerWidth >= 2400 && innerHeight >= 1500)
  }, electronLaunchTimeoutMs)
  afterEach(async ({ task }) =>
    teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  )

  it.each([0.65, 0.8, 1.1])(
    'keeps workflow slots fixed and moves a combination continuously during disclosure, zoom=%s',
    async (zoom) => {
      await page.getByRole('button', { name: '添加项目' }).click()
      const workbenches = await pollUntilState({
        description: 'registered drag project',
        observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
        accept: (items) => items.length === 1,
        timeoutMs: 10000
      })
      const ids = await page.evaluate(
        async ({ workbench, zoom }) => {
          const api = window.cleancode!
          const scope = {
            projectDirectory: workbench.project.directory,
            workspaceId: workbench.graph.workspaceId
          }
          let graph = workbench.graph
          for (const name of ['Install', 'Build', 'Serve', 'Check', 'Compile', 'Preview'])
            graph = await api.createTerminalBlock({
              ...scope,
              name,
              description: '',
              position: { x: 200, y: 200 }
            })
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
          for (const block of graph.blocks)
            graph = await api.resizeTerminalBlock({
              ...scope,
              blockId: block.id,
              position: block.position,
              size: block.size,
              isCollapsed: true
            })
          graph = await api.createTerminalGroup({
            ...scope,
            name: 'Application',
            position: { x: 200, y: 250 }
          })
          const groupId = graph.terminalGroups[0]!.id
          for (const blockId of [ids[0]!, ids[3]!])
            graph = await api.moveTerminalWorkflowToGroup({
              ...scope,
              blockId,
              targetTerminalGroupId: groupId,
              position: graph.blocks.find((block) => block.id === blockId)!.position,
              scope: 'workflow'
            })
          await api.updateGraphViewport({ ...scope, viewport: { x: 30, y: 30, zoom } })
          return { terminals: ids, groupId, edges: graph.connections }
        },
        { workbench: workbenches[0]!, zoom }
      )
      await page.reload()
      const group = page.locator(`[data-terminal-group-id="${ids.groupId}"]`)
      await group.waitFor()
      await waitForMotion(page)
      const bounds = await requiredBox(group.locator('.terminal-group-node__material'))
      const before = await readE2eBlockGraph(workbench)
      const boxes = await Promise.all(
        ids.terminals.map((id) => requiredBox(terminal(page, id).locator('.terminal-node')))
      )
      const root = terminal(page, ids.terminals[0]!)
      const title = await requiredBox(root.locator('.terminal-node__header'))
      await dragTitle(page, root, { x: title.x + 85, y: title.y + 35 }, async () => {
        expect(await requiredBox(root.locator('.terminal-node'))).not.toEqual(boxes[0])
        for (let i = 1; i < ids.terminals.length; i++)
          expect(
            await requiredBox(terminal(page, ids.terminals[i]!).locator('.terminal-node'))
          ).toEqual(boxes[i])
        expect(await requiredBox(group.locator('.terminal-group-node__material'))).toEqual(bounds)
      })
      await waitForMotion(page)
      expectBoxNear(await requiredBox(root.locator('.terminal-node')), boxes[0]!)
      expect((await readE2eBlockGraph(workbench)).blocks).toEqual(before.blocks)
      await dragTitle(
        page,
        root,
        { x: bounds.x + 40, y: bounds.y + bounds.height + 100 },
        async () => {
          expect(await group.locator('.terminal-group-node__drop-hint').count()).toBe(0)
          for (let i = 1; i < ids.terminals.length; i++)
            expectBoxNear(
              await requiredBox(terminal(page, ids.terminals[i]!).locator('.terminal-node')),
              boxes[i]!
            )
        }
      )
      await waitForMotion(page)
      expectBoxNear(await requiredBox(root.locator('.terminal-node')), boxes[0]!)
      expect((await readE2eBlockGraph(workbench)).blocks).toEqual(before.blocks)
      expect((await readE2eBlockGraph(workbench)).terminalGroups).toEqual(before.terminalGroups)

      await root.locator('.terminal-node__disclosure').click()
      await page.waitForFunction((id) => {
        const r = document
          .querySelector(`[data-terminal-block-id="${id}"] .terminal-node`)
          ?.getBoundingClientRect()
        const anchor = document
          .querySelector(`[data-terminal-block-id="${id}"]`)
          ?.closest('.react-flow__node')
          ?.getBoundingClientRect()
        return r && anchor && r.width / anchor.width > 0.6 && r.width / anchor.width < 0.9
      }, ids.terminals[0]!)
      const groupHeader = await requiredBox(group.locator('.terminal-group-node__header'))
      const grab = { x: groupHeader.x + 100, y: groupHeader.y + 20 }
      await page.mouse.move(grab.x, grab.y)
      await page.mouse.down()
      let previousFrame:
        | {
            dx: number
            material: { x: number; y: number }
            members: { x: number; y: number; width: number; height: number }[]
          }
        | undefined
      try {
        for (const dx of [30, 70, 110]) {
          await page.mouse.move(grab.x + dx, grab.y + 30, { steps: 3 })
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
              )
          )
          const material = await requiredBox(group.locator('.terminal-group-node__material'))
          const members = []
          for (const id of ids.terminals) {
            const member = await requiredBox(terminal(page, id).locator('.terminal-node'))
            members.push(member)
            expect(member.x).toBeGreaterThanOrEqual(material.x - 1)
            expect(member.x + member.width).toBeLessThanOrEqual(material.x + material.width + 1)
            expect(member.y + member.height).toBeLessThanOrEqual(material.y + material.height + 1)
          }
          if (previousFrame) {
            expect(
              Math.abs(material.x - previousFrame.material.x - (dx - previousFrame.dx))
            ).toBeLessThan(1)
            for (let i = 0; i < members.length; i++) {
              const before = previousFrame.members[i]!,
                current = members[i]!
              expect(Math.abs(current.x - before.x - (dx - previousFrame.dx))).toBeLessThan(1)
              expect(Math.abs(current.y - before.y)).toBeLessThan(1)
              expect(Math.abs(current.width - before.width)).toBeLessThan(1)
              expect(Math.abs(current.height - before.height)).toBeLessThan(1)
            }
          }
          previousFrame = { dx, material, members }
        }
      } finally {
        await page.mouse.up()
      }
      await waitForMotion(page)
      await waitForGraph(
        workbench,
        (graph) => graph.terminalGroups[0]!.position.x > before.terminalGroups[0]!.position.x + 60
      )
      // Restore the original compact scenario using production commands, then verify the explicit workflow handle.
      await page.getByRole('button', { name: 'Install 折叠终端' }).click()
      await waitForMotion(page)
      await page.evaluate(
        async ({ groupId, workbench }) => {
          await window.cleancode!.moveTerminalGroup({
            projectDirectory: workbench.project.directory,
            workspaceId: workbench.graph.workspaceId,
            terminalGroupId: groupId,
            position: { x: 200, y: 250 }
          })
        },
        { groupId: ids.groupId, workbench: workbenches[0]! }
      )
      await page.reload()
      await group.waitFor()
      await waitForMotion(page)
      const handle = root.locator('.terminal-workflow-drag-handle')
      const handleBounds = await requiredBox(handle)
      await page.mouse.move(handleBounds.x + 30, handleBounds.y + handleBounds.height / 2)
      await page.mouse.down()
      const drop = { x: bounds.x + 70, y: bounds.y + bounds.height + 150 }
      await page.mouse.move(drop.x, drop.y, { steps: 12 })
      await group.locator('.terminal-group-node__drop-hint').waitFor()
      expect(
        await group.locator('.terminal-group-node__material').evaluate((element) => ({
          style: getComputedStyle(element, '::before').outlineStyle,
          color: getComputedStyle(element, '::before').outlineColor,
          expected: getComputedStyle(element).getPropertyValue('--cc-primary-border').trim()
        }))
      ).toMatchObject({ style: 'dashed' })
      expect(await requiredBox(group.locator('.terminal-group-node__material'))).toEqual(bounds)
      for (let i = 3; i < ids.terminals.length; i++)
        expect(
          await requiredBox(terminal(page, ids.terminals[i]!).locator('.terminal-node'))
        ).toEqual(boxes[i])
      const dragged = await Promise.all(
        ids.terminals
          .slice(0, 3)
          .map((id) => requiredBox(terminal(page, id).locator('.terminal-node')))
      )
      const dx = dragged[0]!.x - boxes[0]!.x,
        dy = dragged[0]!.y - boxes[0]!.y
      for (let i = 1; i < 3; i++) {
        expect(dragged[i]!.x - boxes[i]!.x).toBeCloseTo(dx)
        expect(dragged[i]!.y - boxes[i]!.y).toBeCloseTo(dy)
      }
      await page.mouse.up()
      const moved = await waitForGraph(
        workbench,
        (graph) => graph.terminalGroups[0]?.memberBlockIds.length === 3
      )
      // A disk commit precedes its renderer projection. Wait for the committed
      // shell geometry, not the gap before its reflow animation begins.
      await page.waitForFunction(
        ({ id, size, zoom }) => {
          const rect = document
            .querySelector(`[data-terminal-group-id="${id}"] .terminal-group-node__material`)
            ?.getBoundingClientRect()
          return (
            rect &&
            Math.abs(rect.width / zoom - size.width) < 0.5 &&
            Math.abs(rect.height / zoom - size.height) < 0.5
          )
        },
        { id: ids.groupId, size: moved.terminalGroups[0]!.size, zoom }
      )
      await waitForMotion(page)
      const smaller = await requiredBox(group.locator('.terminal-group-node__material'))
      expect(smaller.x).toBe(bounds.x)
      expect(smaller.y).toBe(bounds.y)
      expect(smaller.height).toBeLessThan(bounds.height)
      expect(moved.connections).toEqual(ids.edges)
      for (const edge of ids.edges ?? [])
        expect(
          await page
            .locator(`.react-flow__edge[data-id="${edge.id}"] .react-flow__edge-path`)
            .getAttribute('d')
        ).toContain('C')
      const stable = await requiredBox(group.locator('.terminal-group-node__material'))
      await page.reload()
      await group.waitFor()
      await waitForMotion(page)
      expectBoxNear(await requiredBox(group.locator('.terminal-group-node__material')), stable)
    },
    electronScenarioTimeoutMs * 2
  )

  it(
    'preserves real sessions and dependencies while terminals and a workflow enter and leave a folded combination',
    async () => {
      await page.getByRole('button', { name: '添加项目' }).click()
      const workbenches = await pollUntilState({
        description: 'project registration',
        observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
        accept: (items) => items.length === 1,
        timeoutMs: 10_000
      })
      const ids = await page.evaluate(async (workbench) => {
        const api = window.cleancode!
        const scope = {
          projectDirectory: workbench.project.directory,
          workspaceId: workbench.graph.workspaceId
        }
        let graph = workbench.graph
        for (const [name, x, y] of [
          ['Prepare', 100, 300],
          ['Build', 760, 300],
          ['Outside', 100, 850]
        ] as const) {
          graph = await api.createTerminalBlock({
            ...scope,
            name,
            description: '',
            position: { x, y }
          })
          const block = graph.blocks.at(-1)!
          graph = await api.resizeTerminalBlock({
            ...scope,
            blockId: block.id,
            position: block.position,
            size: { width: 420, height: 280 }
          })
        }
        const [a, b, c] = graph.blocks.map((block) => block.id) as [string, string, string]
        graph = await api.connectTerminalBlocks({ ...scope, sourceBlockId: a, targetBlockId: b })
        graph = await api.connectTerminalBlocks({ ...scope, sourceBlockId: b, targetBlockId: c })
        graph = await api.createTerminalGroup({
          ...scope,
          name: 'Application',
          position: { x: 1500, y: 300 }
        })
        const groupId = graph.terminalGroups[0]!.id
        graph = await api.createTerminalGroup({
          ...scope,
          name: 'Other',
          position: { x: 1500, y: 900 }
        })
        await api.addQuickExecutionTarget({
          ...scope,
          target: { type: 'workflow', terminalBlockIds: [a, b, c] }
        })
        await api.updateGraphViewport({ ...scope, viewport: { x: 30, y: 30, zoom: 0.8 } })
        return { a, b, c, groupId, edges: graph.connections! }
      }, workbenches[0]!)
      await page.reload()
      for (const name of ['Prepare', 'Build', 'Outside'])
        await waitForTerminalShellReady(page, name)
      await writeTerminalCommand(
        page,
        'Prepare',
        asE2eTerminalInput(createE2ePrintCommand('DISCLOSURE_SESSION_中文'))
      )
      await waitForTerminalOutput(page, 'Prepare', 'DISCLOSURE_SESSION_中文')
      const sessionId = await readTerminalSessionId(page, 'Prepare')
      const xterm = await terminal(page, ids.a).locator('.xterm').elementHandle()
      await page.getByRole('button', { name: 'Prepare 折叠终端' }).click()
      await terminal(page, ids.a).locator('.terminal-node--collapsed').waitFor()
      await page.waitForFunction((id) => {
        const bounds = document
          .querySelector(`[data-terminal-block-id="${id}"] .terminal-node`)
          ?.getBoundingClientRect()
        return bounds && Math.abs(bounds.width - 176) < 1 && Math.abs(bounds.height - 35.2) < 1
      }, ids.a)
      expect(await terminal(page, ids.a).locator('.terminal-node__actions button').count()).toBe(1)
      expect(
        await terminal(page, ids.a)
          .locator('.terminal-node__body')
          .evaluate((element) => getComputedStyle(element).visibility)
      ).toBe('hidden')
      expect(await xterm!.evaluate((element) => element.isConnected)).toBe(true)
      const viewportSizes = await terminal(page, ids.a)
        .locator('.terminal-viewport')
        .evaluateHandle((viewport) => {
          const sizes: string[] = []
          const observer = new ResizeObserver((entries) => {
            for (const { contentRect } of entries)
              sizes.push(`${contentRect.width}x${contentRect.height}`)
          })
          observer.observe(viewport)
          return { sizes, observer }
        })
      await page.getByRole('button', { name: 'Prepare 展开终端' }).click()
      await terminal(page, ids.a).locator('.terminal-node:not(.terminal-node--collapsed)').waitFor()
      await waitForMotion(page)
      expect(
        await viewportSizes.evaluate(({ sizes, observer }) => {
          observer.disconnect()
          return new Set(sizes).size
        })
      ).toBeLessThanOrEqual(2)
      await viewportSizes.dispose()
      expect(await readTerminalSessionId(page, 'Prepare')).toBe(sessionId)
      expect(
        await xterm!.evaluate(
          (element) =>
            element ===
            document.querySelector(
              `[data-terminal-block-id="${element.closest('[data-terminal-block-id]')?.getAttribute('data-terminal-block-id')}"] .xterm`
            )
        )
      ).toBe(true)

      const group = page.locator(`[data-terminal-group-id="${ids.groupId}"]`)
      const original = await readE2eBlockGraph(workbench)
      const boundary = await requiredBox(group.locator('.terminal-group-node__material'))
      const groupPoint = { x: boundary.x + 100, y: boundary.y + 100 }
      await dragTitle(page, terminal(page, ids.a), groupPoint, async () => {
        expect(await group.locator('.terminal-group-node__drop-hint').count()).toBe(0)
        expect((await readE2eBlockGraph(workbench)).terminalGroups[0]?.memberBlockIds).toEqual([])
        expect(await requiredBox(group.locator('.terminal-group-node__material'))).toEqual(boundary)
        await page.keyboard.press('Escape')
      })
      await waitForGraph(
        workbench,
        (graph) =>
          graph.blocks.find((block) => block.id === ids.a)?.position.x ===
          original.blocks[0]!.position.x
      )
      expect((await readE2eBlockGraph(workbench)).terminalGroups[0]?.memberBlockIds).toEqual([])
      // Construct an existing cross-boundary workflow with the public application command.
      // Canvas title dragging preserves workflow membership; grouped terminals return to slots.
      await page.evaluate(
        async ({ ids, workbench }) =>
          window.cleancode!.moveTerminalWorkflowToGroup({
            projectDirectory: workbench.project.directory,
            workspaceId: workbench.graph.workspaceId,
            blockId: ids.a,
            targetTerminalGroupId: ids.groupId,
            scope: 'terminal',
            position: { x: 1500, y: 300 }
          }),
        { ids, workbench: workbenches[0]! }
      )
      await page.reload()
      // Restored PowerShell prompts can wrap at the compact workflow width.
      // The existing session's output proves restore; a new prompt is not required.
      await waitForTerminalOutput(page, 'Prepare', 'DISCLOSURE_SESSION_中文')
      await waitForGraph(
        workbench,
        (graph) => graph.terminalGroups[0]?.memberBlockIds.join() === ids.a
      )
      await waitForMotion(page)
      expect((await readE2eBlockGraph(workbench)).terminalGroups[0]?.position).toEqual({
        x: 1500,
        y: 300
      })
      expect(await readTerminalSessionId(page, 'Prepare')).toBe(sessionId)
      const more = page.getByRole('button', { name: 'Application 更多组合操作' })
      await more.click()
      const dissolve = page.getByRole('menuitem', { name: '解散组合', exact: true })
      await dissolve.hover()
      expect(
        await dissolve.evaluate((item) => {
          const bounds = item.getBoundingClientRect()
          return item.contains(
            document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
          )
        })
      ).toBe(true)
      await page.keyboard.press('Escape')
      expect(await more.evaluate((button) => document.activeElement === button)).toBe(true)
      await page.getByRole('button', { name: 'Application 折叠组合' }).click()
      await group
        .getByRole('button', { name: 'Application 展开组合', exact: true, expanded: false })
        .waitFor()
      const attachment = await page.evaluate(
        async ({ groupId, edgeId }) => {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
          const material = document
            .querySelector(`[data-terminal-group-id="${groupId}"] .terminal-group-node__material`)!
            .getBoundingClientRect()
          const path = document.querySelector<SVGPathElement>(
            `.react-flow__edge[data-id="${edgeId}"] .react-flow__edge-path`
          )!
          const point = path.getPointAtLength(0)
          const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!)
          return {
            x: screen.x,
            y: screen.y,
            right: material.right,
            centerY: material.top + material.height / 2
          }
        },
        { groupId: ids.groupId, edgeId: ids.edges[0]!.id }
      )
      expect(Math.abs(attachment.x - attachment.right)).toBeLessThan(2)
      expect(Math.abs(attachment.y - attachment.centerY)).toBeLessThan(2)
      await waitForMotion(page)
      expect(
        await page.locator(`.react-flow__edge[data-id="${ids.edges[0]!.id}"] path`).count()
      ).toBeGreaterThan(0)
      const folded = await requiredBox(group)
      await dragTitle(page, terminal(page, ids.c), { x: folded.x + 70, y: folded.y + 20 })
      await waitForMotion(page)
      expect((await readE2eBlockGraph(workbench)).terminalGroups[0]?.memberBlockIds).toEqual([
        ids.a
      ])
      await page.evaluate(
        async ({ ids, workbench }) =>
          window.cleancode!.moveTerminalWorkflowToGroup({
            projectDirectory: workbench.project.directory,
            workspaceId: workbench.graph.workspaceId,
            blockId: ids.c,
            targetTerminalGroupId: ids.groupId,
            scope: 'terminal',
            position: { x: 1500, y: 300 }
          }),
        { ids, workbench: workbenches[0]! }
      )
      const foldedGraph = await waitForGraph(
        workbench,
        (graph) => graph.terminalGroups[0]?.memberBlockIds.length === 2
      )
      expect(foldedGraph.terminalGroups[0]?.isCollapsed).toBe(true)
      expect(foldedGraph.connections).toEqual(ids.edges)
      await page.reload()
      await waitForTerminalShellReady(page, 'Build')
      await waitForMotion(page)
      const beforeWorkflowMove = await readE2eBlockGraph(workbench)
      // Quick slots drag only their binding; the visible workflow label owns canvas movement.
      const label = terminal(page, ids.b).locator('.terminal-workflow-drag-handle')
      const labelBox = await requiredBox(label)
      const paneBox = await requiredBox(page.locator('.react-flow__pane'))
      await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(paneBox.x + 900, paneBox.y + 700, { steps: 18 })
      await page.mouse.up()
      const moved = await waitForGraph(
        workbench,
        (graph) => graph.terminalGroups[0]?.memberBlockIds.length === 0
      )
      expect(moved.connections).toEqual(ids.edges)
      const delta = {
        x: moved.blocks[0]!.position.x - beforeWorkflowMove.blocks[0]!.position.x,
        y: moved.blocks[0]!.position.y - beforeWorkflowMove.blocks[0]!.position.y
      }
      for (const block of moved.blocks) {
        const previous = beforeWorkflowMove.blocks.find((entry) => entry.id === block.id)!
        expect(block.position.x - previous.position.x).toBeCloseTo(delta.x)
        expect(block.position.y - previous.position.y).toBeCloseTo(delta.y)
      }
      expect(await readTerminalSessionId(page, 'Prepare')).toBe(sessionId)
      await page.reload()
      await waitForTerminalShellReady(page, 'Prepare')
      expect((await readE2eBlockGraph(workbench)).connections).toEqual(ids.edges)
      expect((await readE2eBlockGraph(workbench)).terminalGroups[0]?.memberBlockIds).toEqual([])
      expect(await readTerminalSessionId(page, 'Prepare')).toBe(sessionId)
      await ensureTerminalDomRenderer(terminal(page, ids.a).locator('.terminal-viewport'))
      await page.waitForFunction(
        ({ id, marker }) =>
          document
            .querySelector(`[data-terminal-block-id="${id}"] .xterm-rows`)
            ?.textContent?.includes(marker),
        { id: ids.a, marker: 'DISCLOSURE_SESSION_中文' }
      )
      await writeTerminalCommand(
        page,
        'Prepare',
        asE2eTerminalInput(createE2ePrintCommand('AFTER_DRAG_恢复'))
      )
      await waitForTerminalOutput(page, 'Prepare', 'AFTER_DRAG_恢复')
      const screenshots = join(process.cwd(), 'test-results/terminal-disclosure')
      await mkdir(screenshots, { recursive: true })
      await page.screenshot({ path: join(screenshots, 'application-drag-recovered.png') })
    },
    electronScenarioTimeoutMs * 2
  )
})

function terminal(page: Page, id: string) {
  return page.locator(`[data-terminal-block-id="${id}"]`)
}
async function requiredBox(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected visible canvas surface')
  return box
}
async function dragTitle(
  page: Page,
  target: Locator,
  point: { x: number; y: number },
  inspect?: () => Promise<void>
) {
  const box = await requiredBox(target.locator('.terminal-node__header'))
  await page.mouse.move(box.x + 45, box.y + box.height / 2)
  await page.mouse.down()
  try {
    await page.mouse.move(point.x, point.y, { steps: 15 })
    await inspect?.()
  } finally {
    await page.mouse.up()
  }
}
async function waitForGraph(
  workbench: E2eWorkbench,
  accept: (graph: BlockGraphSnapshot) => boolean
) {
  return pollUntilState({
    description: 'committed terminal group drag result',
    observe: () => readE2eBlockGraph(workbench),
    accept,
    timeoutMs: 10_000
  })
}
async function waitForMotion(page: Page) {
  await page.waitForFunction(
    () =>
      !document.querySelector(
        '.workbench-object-motion--spatial, .workbench-object-presence--pending'
      )
  )
}

function expectBoxNear(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number }
) {
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(
      Math.abs(actual[key] - expected[key]),
      JSON.stringify({ key, actual, expected })
    ).toBeLessThan(0.5)
}
