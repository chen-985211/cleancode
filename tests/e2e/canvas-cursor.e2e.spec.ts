// @vitest-environment node

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'

describe('canvas cursor e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-canvas-cursor-e2e')
    resources.workbench = workbench
    electronApp = await launchApp(workbench)
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
    'keeps one native pointer across canvas and node drag states',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()

      const pane = page.locator('.react-flow__pane')
      await pane.waitFor()
      const idlePaneCursor = await readCursor(pane)

      await pane.evaluate((element) => element.classList.add('dragging'))
      const draggingPaneCursor = await readCursor(pane)
      await pane.evaluate((element) => element.classList.remove('dragging'))

      await page.getByRole('button', { name: '新建终端积木' }).click()
      const node = page.locator('.react-flow__node').filter({ hasText: 'Terminal 1' })
      const header = node.locator('.terminal-node__header')
      await header.waitFor()
      const idleNodeCursor = await readCursor(node)
      const headerCursor = await readCursor(header)

      await node.evaluate((element) => element.classList.add('dragging'))
      const draggingNodeCursor = await readCursor(node)

      expect(idlePaneCursor).toContain('data:image/svg+xml')
      expect(idlePaneCursor).toMatch(/\s3\s3,\sdefault$/)
      expect([
        idlePaneCursor,
        draggingPaneCursor,
        idleNodeCursor,
        draggingNodeCursor,
        headerCursor
      ]).toEqual(Array.from({ length: 5 }, () => idlePaneCursor))
    },
    electronScenarioTimeoutMs
  )
})

async function readCursor(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).cursor)
}
