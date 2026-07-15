// @vitest-environment node

import { basename, join } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'

import {
  captureE2eFailureDiagnostics,
  closeElectronApp,
  cleanupE2eWorkbench,
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  pathExists,
  waitForJsonFile,
  type E2eWorkbench
} from '../support/e2eWorkbench'

describe('project workspaces e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page

  beforeEach(async () => {
    workbench = await createE2eWorkbench('cleancode-project-workspace-e2e')
    electronApp = await launchApp(workbench)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async ({ task }) => {
    try {
      if (task.result?.state === 'fail') {
        await captureE2eFailureDiagnostics({ electronApp, page, taskName: task.name, workbench })
      }
    } finally {
      try {
        await closeElectronApp(electronApp)
      } finally {
        await cleanupE2eWorkbench(workbench)
      }
    }
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
      electronApp = await launchApp(workbench)
      page = await electronApp.firstWindow()
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
