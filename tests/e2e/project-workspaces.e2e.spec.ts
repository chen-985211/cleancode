// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'

import {
  buildElectronApp,
  cleanupE2eWorkbench,
  createE2eWorkbench,
  electronBuildTimeoutMs,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  expectNoFakeRuntimeData,
  expectNoOpenProjectButton,
  expectSingleWorkbenchToolbarAction,
  launchApp,
  pathExists,
  waitForJsonFile,
  type E2eWorkbench
} from '../support/e2eWorkbench'

describe('project workspaces e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page

  beforeAll(async () => {
    await buildElectronApp()
  }, electronBuildTimeoutMs)

  beforeEach(async () => {
    workbench = await createE2eWorkbench('cleancode-project-workspace-e2e')
    electronApp = await launchApp(workbench)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async () => {
    await electronApp.close()
    await cleanupE2eWorkbench(workbench)
  })

  it(
    'creates a local project workspace without fake runtime data',
    async () => {
      await expectDesktopRuntime(page)
      await expectNoOpenProjectButton(page)
      await expectSingleWorkbenchToolbarAction(page)
      await expectNoFakeRuntimeData(page)

      await page.getByRole('button', { name: '添加项目' }).click()

      const projectMetadata = JSON.parse(
        await waitForJsonFile(workbench.appStateDirectory, 'project.json')
      ) as { name: string; workspaces: Array<{ name: string }> }

      expect(await pathExists(join(workbench.projectDirectory, '.cleancode'))).toBe(false)
      expect(projectMetadata.name).toBe(basename(workbench.projectDirectory))
      expect(projectMetadata.workspaces.map((workspace) => workspace.name)).toEqual(['main'])
    },
    electronScenarioTimeoutMs
  )

  it(
    'restores remembered project workspaces and block graphs after the app restarts',
    async () => {
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()

      await electronApp.close()
      electronApp = await launchApp(workbench)
      page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: basename(workbench.projectDirectory) }).waitFor()
      await page.getByText('Terminal 1').waitFor()
    },
    electronScenarioTimeoutMs
  )

  it('removes a remembered project without deleting the project directory', async () => {
    await expectDesktopRuntime(page)

    await page.getByRole('button', { name: '添加项目' }).click()
    const projectCard = page.getByRole('group', {
      name: `项目 ${basename(workbench.projectDirectory)}`
    })

    await projectCard.waitFor()
    await projectCard.getByRole('button', { name: '移除项目' }).click()
    await projectCard.waitFor({ state: 'detached' })

    const registry = JSON.parse(
      await readFile(join(workbench.registryDirectory, 'project-registry.json'), 'utf8')
    ) as { projectDirectories: string[] }

    expect(registry.projectDirectories).toEqual([])
    expect(await pathExists(workbench.projectDirectory)).toBe(true)
    expect(await page.getByRole('button', { name: '新建终端积木' }).isDisabled()).toBe(true)

    await electronApp.close()
    electronApp = await launchApp(workbench)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expectDesktopRuntime(page)
    expect(
      await page.getByRole('button', { name: basename(workbench.projectDirectory) }).count()
    ).toBe(0)
  })
})
