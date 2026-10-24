// @vitest-environment node

import { mkdir } from 'node:fs/promises'
import type { Page } from 'playwright'
import {
  closeElectronApp,
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { pollUntilState } from '../support/e2ePolling'
import { settle } from '../support/e2eTerminalGeometry'
import { createE2eTerminalEnvironment } from '../support/e2eTerminal'

describe('canvas layer order recovery', () => {
  let workbench: E2eWorkbench
  let resources: E2eScenarioResources
  let page: Page
  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-layer-order')
    resources.workbench = workbench
    resources.electronApp = await launchApp(workbench, {
      environment: createE2eTerminalEnvironment()
    })
    page = await resources.electronApp.firstWindow()
    resources.page = page
    await mkdir('test-results/canvas-layer-order', { recursive: true })
  }, electronLaunchTimeoutMs)
  afterEach(async ({ task }) =>
    teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  )

  it(
    'keeps a dragged workflow above an overlapping node after restarting the application',
    async () => {
      await page.getByRole('button', { name: '添加项目' }).click()
      const registered = await pollUntilState({
        description: 'registered layer order project',
        timeoutMs: 10000,
        observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
        accept: (entries) => entries.length === 1
      })
      const graph = await page.evaluate(async (entry) => {
        const api = window.cleancode!,
          scope = {
            projectDirectory: entry.project.directory,
            workspaceId: entry.graph.workspaceId
          }
        let graph = entry.graph
        for (const [name, x, y] of [
          ['First', 100, 340],
          ['Second', 750, 340],
          ['Obstacle', 370, 370]
        ] as const) {
          graph = await api.createTerminalBlock({
            ...scope,
            name,
            description: '',
            position: { x, y }
          })
        }
        graph = await api.connectTerminalBlocks({
          ...scope,
          sourceBlockId: graph.blocks[0]!.id,
          targetBlockId: graph.blocks[1]!.id
        })
        await api.updateGraphViewport({ ...scope, viewport: { x: 35, y: 35, zoom: 0.7 } })
        return graph
      }, registered[0]!)
      await page.reload()
      await page.locator('.terminal-workflow-drag-handle').waitFor()
      await settle(page)
      const ids = graph.blocks.map((block) => block.id)
      const edgeId = graph.connections![0]!.id
      const read = () => readLayers(page, ids, edgeId)
      const before = await read()
      expect(before.nodes[0]).toBeLessThan(before.nodes[2]!)
      const box = (await page.locator('.terminal-workflow-drag-handle').boundingBox())!
      expect(
        await page.evaluate(
          ({ x, y }) =>
            Boolean(document.elementFromPoint(x, y)?.closest('.terminal-workflow-drag-handle')),
          { x: box.x + 25, y: box.y + box.height / 2 }
        )
      ).toBe(true)
      await page.mouse.move(box.x + 25, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + 65, box.y + box.height / 2 + 30, { steps: 8 })
      await page.mouse.up()
      await pollUntilState({
        description: 'workflow order committed through preload and filesystem',
        timeoutMs: 10000,
        observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
        accept: (entries) =>
          entries[0]?.canvasArrangement.layerOrder?.[0]?.kind === 'terminal' &&
          entries[0].canvasArrangement.layerOrder[0].terminalId === ids[2]
      })
      await settle(page)
      const retained = await read()
      expect(retained.nodes[0]).toBe(retained.nodes[1])
      expect(retained.edge).toBeGreaterThan(retained.nodes[2]!)
      expect(retained.nodes[0]).toBeGreaterThan(retained.edge)
      await closeElectronApp(resources.electronApp!)
      resources.electronApp = undefined
      resources.page = undefined
      resources.electronApp = await launchApp(workbench, {
        environment: createE2eTerminalEnvironment()
      })
      page = await resources.electronApp.firstWindow()
      resources.page = page
      await page.locator('.terminal-workflow-drag-handle').waitFor()
      await settle(page)
      expect(await read()).toEqual(retained)
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme })
        await page.waitForFunction(
          (theme) => document.documentElement.dataset.theme === theme,
          theme
        )
        await page.screenshot({ path: `test-results/canvas-layer-order/restored-${theme}.png` })
      }
    },
    electronScenarioTimeoutMs
  )
})

function readLayers(page: Page, ids: string[], edgeId: string) {
  return page.evaluate(
    ({ ids, edgeId }) => ({
      nodes: ids.map((id) =>
        Number(
          getComputedStyle(document.querySelector(`.react-flow__node[data-id="${id}"]`)!).zIndex
        )
      ),
      edge: Number(
        getComputedStyle(
          document.querySelector(`.react-flow__edge[data-id="${edgeId}"]`)!.closest('svg')!
        ).zIndex
      )
    }),
    { ids, edgeId }
  )
}
