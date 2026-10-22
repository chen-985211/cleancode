// @vitest-environment node

import type { Page } from 'playwright'
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
import { pollUntilState } from '../support/e2ePolling'

// The regression crossed renderer selection, preload validation and graph persistence.
// Scope variants and stale membership remain covered by contract and unit tests.
describe('empty terminal group removal', () => {
  let resources: E2eScenarioResources
  let workbench: E2eWorkbench
  let page: Page

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-empty-group-removal')
    resources.workbench = workbench
    const app = await launchApp(workbench)
    resources.electronApp = app
    page = await app.firstWindow()
    resources.page = page
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async ({ task }) =>
    teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  )

  it(
    'removes an empty group through its context menu and keeps it removed after reload',
    async () => {
      await page.getByRole('button', { name: '添加项目' }).click()
      const workbenches = await pollUntilState({
        description: 'registered project for group removal',
        observe: () => page.evaluate(() => window.cleancode!.listWorkbenches()),
        accept: (items) => items.length === 1,
        timeoutMs: 10000
      })
      const id = await page.evaluate(async (workbench) => {
        const scope = {
          projectDirectory: workbench.project.directory,
          workspaceId: workbench.graph.workspaceId
        }
        const graph = await window.cleancode!.createTerminalGroup({
          ...scope,
          name: 'Empty',
          position: { x: 100, y: 180 }
        })
        await window.cleancode!.updateGraphViewport({
          ...scope,
          viewport: { x: 0, y: 0, zoom: 0.7 }
        })
        return graph.terminalGroups[0]!.id
      }, workbenches[0]!)
      await page.reload()
      const group = page.locator(`[data-terminal-group-id="${id}"]`)
      await group.waitFor()
      await group.locator('.terminal-group-node__name').click({ button: 'right' })
      await page.getByRole('menuitem', { name: '移除组合', exact: true }).click()
      await group.waitFor({ state: 'hidden' })
      const graph = await pollUntilState({
        description: 'empty group removal persisted',
        observe: () => readE2eBlockGraph(workbench),
        accept: (graph) => graph.terminalGroups.length === 0,
        timeoutMs: 10000
      })
      expect(graph.blocks).toEqual([])
      expect(await page.getByText('移除失败', { exact: true }).count()).toBe(0)
      await page.reload()
      await page.locator('.react-flow__pane').waitFor()
      expect(await group.count()).toBe(0)
    },
    electronScenarioTimeoutMs
  )
})
