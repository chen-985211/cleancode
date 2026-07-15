// @vitest-environment node

import { basename, join } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'

import {
  closeElectronApp,
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  pathExists,
  teardownE2eScenario,
  waitForJsonFile,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'

describe('project workspaces e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-project-workspace-e2e')
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
    'creates and restores a local project workspace graph without fake runtime data',
    async () => {
      await expectDesktopRuntime(page)
      await expectNoBrowserPreviewData(page)

      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()

      const projectMetadata = JSON.parse(
        await waitForJsonFile(workbench.appStateDirectory, 'project.json')
      ) as { name: string; workspaces: Array<{ name: string }> }
      const graph = JSON.parse(
        await waitForJsonFile(workbench.appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ type: string; name: string }>
      }

      expect(await pathExists(join(workbench.projectDirectory, '.cleancode'))).toBe(false)
      expect(projectMetadata.name).toBe(basename(workbench.projectDirectory))
      expect(projectMetadata.workspaces.map((workspace) => workspace.name)).toEqual(['main'])
      expect(graph.blocks).toEqual([
        expect.objectContaining({ type: 'terminal', name: 'Terminal 1' })
      ])

      await closeElectronApp(electronApp)
      resources.electronApp = undefined
      resources.page = undefined
      electronApp = await launchApp(workbench)
      resources.electronApp = electronApp
      page = await electronApp.firstWindow()
      resources.page = page
      await page.waitForLoadState('domcontentloaded')
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: basename(workbench.projectDirectory) }).waitFor()
      await page.getByText('Terminal 1').waitFor()
    },
    electronScenarioTimeoutMs
  )
})

async function expectNoBrowserPreviewData(page: Page): Promise<void> {
  expect(await page.getByRole('button', { name: '打开项目' }).count()).toBe(0)
  expect(await page.getByText('添加数据库终端').count()).toBe(0)
  expect(await page.getByText('添加测试终端').count()).toBe(0)
}
