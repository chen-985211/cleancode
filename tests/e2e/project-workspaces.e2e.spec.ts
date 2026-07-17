// @vitest-environment node

import { mkdtemp } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'

import { CreateProjectUseCase } from '../../src/contexts/project/application/use-cases/CreateProjectUseCase'
import { ProjectRegistry } from '../../src/contexts/project/domain/aggregates/ProjectRegistry'
import { FileSystemProjectRegistryRepository } from '../../src/contexts/project/infrastructure/filesystem/FileSystemProjectRegistryRepository'
import { FileSystemProjectRepository } from '../../src/contexts/project/infrastructure/filesystem/FileSystemProjectRepository'

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

  it(
    'restores the project that was current before the application restarted',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await page
        .getByRole('button', { name: basename(workbench.projectDirectory), exact: true })
        .waitFor()

      await closeElectronApp(electronApp)
      resources.electronApp = undefined
      resources.page = undefined

      const betaProjectDirectory = await mkdtemp(join(workbench.projectDirectory, 'beta-'))
      const betaProjectName = basename(betaProjectDirectory)
      const projectRepository = new FileSystemProjectRepository(workbench.appStateDirectory)
      await new CreateProjectUseCase(projectRepository).execute({
        directory: betaProjectDirectory,
        name: betaProjectName
      })
      const registryRepository = new FileSystemProjectRegistryRepository(
        join(workbench.registryDirectory, 'project-registry.json')
      )
      await registryRepository.save(
        ProjectRegistry.fromSnapshot({
          currentProjectDirectory: workbench.projectDirectory,
          projectDirectories: [workbench.projectDirectory, betaProjectDirectory]
        })
      )

      electronApp = await launchApp(workbench)
      resources.electronApp = electronApp
      page = await electronApp.firstWindow()
      resources.page = page
      await page.waitForLoadState('domcontentloaded')
      await expectDesktopRuntime(page)

      const alphaProject = page.getByRole('group', {
        name: `项目 ${basename(workbench.projectDirectory)}`
      })
      const betaProject = page.getByRole('group', { name: `项目 ${betaProjectName}` })
      const alphaWorkspace = alphaProject.getByRole('button', {
        name: 'Git 未初始化 默认工作区'
      })
      const betaWorkspace = betaProject.getByRole('button', {
        name: 'Git 未初始化 默认工作区'
      })

      await expect.poll(() => alphaWorkspace.getAttribute('aria-current')).toBe('page')
      await betaProject.getByRole('button', { name: betaProjectName, exact: true }).click()
      await expect.poll(() => betaWorkspace.getAttribute('aria-current')).toBe('page')
      await expect
        .poll(async () => (await registryRepository.get()).currentProjectDirectory)
        .toBe(betaProjectDirectory)

      await closeElectronApp(electronApp)
      resources.electronApp = undefined
      resources.page = undefined
      electronApp = await launchApp(workbench)
      resources.electronApp = electronApp
      page = await electronApp.firstWindow()
      resources.page = page
      await page.waitForLoadState('domcontentloaded')
      await expectDesktopRuntime(page)

      const restoredBetaWorkspace = page
        .getByRole('group', { name: `项目 ${betaProjectName}` })
        .getByRole('button', { name: 'Git 未初始化 默认工作区' })
      await expect.poll(() => restoredBetaWorkspace.getAttribute('aria-current')).toBe('page')
    },
    electronScenarioTimeoutMs
  )
})

async function expectNoBrowserPreviewData(page: Page): Promise<void> {
  expect(await page.getByRole('button', { name: '打开项目' }).count()).toBe(0)
  expect(await page.getByText('添加数据库终端').count()).toBe(0)
  expect(await page.getByText('添加测试终端').count()).toBe(0)
}
