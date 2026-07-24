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
import { waitForE2eBlockGraph } from '../support/e2eBlockGraph'

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
    'keeps the titlebar sidebar control aligned and interactive across fullscreen and collapse states',
    async () => {
      await expectDesktopRuntime(page)
      const titlebarNavigation = page.getByRole('navigation', { name: '窗口导航' })
      const sidebar = page.locator('#project-sidebar')
      const collapseSidebar = titlebarNavigation.getByRole('button', { name: '收起侧边栏' })

      await expect
        .poll(() => readSidebarTitlebarGeometry(page))
        .toMatchObject({
          button: { height: 24, width: 32, x: 80, y: 6 },
          buttonOwnsHitTarget: true,
          navigationBoundary: {
            backgroundColor: 'rgba(0, 0, 0, 0)',
            borderRightWidth: '0px',
            boxShadow: 'none'
          },
          navigation: { height: 36, x: 0, y: 0 },
          sidebar: {
            backgroundColor: 'rgba(0, 0, 0, 0)',
            borderRightWidth: '0px',
            y: 36
          }
        })

      await collapseSidebar.click()

      await expect.poll(() => sidebar.getAttribute('aria-hidden')).toBe('true')
      const expandSidebar = titlebarNavigation.getByRole('button', { name: '展开侧边栏' })
      await expandSidebar.waitFor()
      await expect
        .poll(() => readSidebarTitlebarGeometry(page))
        .toMatchObject({
          button: { height: 24, width: 32, x: 80, y: 6 },
          buttonOwnsHitTarget: true,
          navigationBoundary: {
            backgroundColor: 'rgba(0, 0, 0, 0)',
            borderRightWidth: '0px',
            boxShadow: 'none'
          },
          navigation: { height: 36, width: 112, x: 0, y: 0 },
          sidebar: {
            backgroundColor: 'rgba(0, 0, 0, 0)',
            borderRightWidth: '0px'
          }
        })
      await expandSidebar.click()

      await expect.poll(() => sidebar.getAttribute('aria-hidden')).toBeNull()
      await titlebarNavigation.getByRole('button', { name: '收起侧边栏' }).waitFor()

      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.emit('enter-full-screen')
      })
      await expect
        .poll(() => readSidebarTitlebarGeometry(page))
        .toMatchObject({
          button: { height: 24, width: 32, x: 0, y: 6 },
          buttonOwnsHitTarget: true,
          navigation: { height: 36, x: 0, y: 0 }
        })

      await titlebarNavigation.getByRole('button', { name: '收起侧边栏' }).click()
      await expect.poll(() => sidebar.getAttribute('aria-hidden')).toBe('true')
      await expect
        .poll(() => readSidebarTitlebarGeometry(page))
        .toMatchObject({
          button: { height: 24, width: 32, x: 0, y: 6 },
          buttonOwnsHitTarget: true,
          navigation: { height: 36, width: 32, x: 0, y: 0 }
        })
      await titlebarNavigation.getByRole('button', { name: '展开侧边栏' }).click()
      await expect.poll(() => sidebar.getAttribute('aria-hidden')).toBeNull()

      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.emit('leave-full-screen')
      })
      await expect
        .poll(() => readSidebarTitlebarGeometry(page))
        .toMatchObject({
          button: { height: 24, width: 32, x: 80, y: 6 },
          buttonOwnsHitTarget: true,
          navigation: { height: 36, x: 0, y: 0 }
        })
    },
    electronScenarioTimeoutMs
  )

  it(
    'creates and restores a local project workspace graph without fake runtime data',
    { tags: 'smoke', timeout: electronScenarioTimeoutMs },
    async () => {
      await expectDesktopRuntime(page)
      await expectNoBrowserPreviewData(page)

      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()

      const projectMetadata = JSON.parse(
        await waitForJsonFile(workbench.appStateDirectory, 'project.json')
      ) as { name: string; workspaces: Array<{ name: string }> }
      const graph = await waitForE2eBlockGraph(workbench)

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
    }
  )
})

async function readSidebarTitlebarGeometry(page: Page): Promise<{
  readonly button: {
    readonly height: number
    readonly width: number
    readonly x: number
    readonly y: number
  }
  readonly buttonOwnsHitTarget: boolean
  readonly navigation: {
    readonly height: number
    readonly width: number
    readonly x: number
    readonly y: number
  }
  readonly navigationBoundary: {
    readonly backgroundColor: string
    readonly borderRightWidth: string
    readonly boxShadow: string
  }
  readonly sidebar: {
    readonly backgroundColor: string
    readonly borderRightWidth: string
    readonly y: number
  }
}> {
  return page.evaluate(() => {
    const navigation = document.querySelector<HTMLElement>('.app-shell__titlebar-navigation')
    const button = navigation?.querySelector<HTMLElement>('.project-sidebar-toggle')
    const sidebar = document.querySelector<HTMLElement>('#project-sidebar')

    if (!navigation || !button || !sidebar) {
      throw new Error('Sidebar titlebar geometry is unavailable.')
    }

    const buttonRect = button.getBoundingClientRect()
    const navigationRect = navigation.getBoundingClientRect()
    const sidebarRect = sidebar.getBoundingClientRect()
    const navigationStyle = getComputedStyle(navigation)
    const sidebarStyle = getComputedStyle(sidebar)
    const hitTarget = document.elementFromPoint(
      buttonRect.left + buttonRect.width / 2,
      buttonRect.top + buttonRect.height / 2
    )
    const round = (value: number): number => Math.round(value)

    return {
      button: {
        height: round(buttonRect.height),
        width: round(buttonRect.width),
        x: round(buttonRect.x),
        y: round(buttonRect.y)
      },
      buttonOwnsHitTarget: hitTarget === button || Boolean(hitTarget && button.contains(hitTarget)),
      navigation: {
        height: round(navigationRect.height),
        width: round(navigationRect.width),
        x: round(navigationRect.x),
        y: round(navigationRect.y)
      },
      navigationBoundary: {
        backgroundColor: navigationStyle.backgroundColor,
        borderRightWidth: navigationStyle.borderRightWidth,
        boxShadow: navigationStyle.boxShadow
      },
      sidebar: {
        backgroundColor: sidebarStyle.backgroundColor,
        borderRightWidth: sidebarStyle.borderRightWidth,
        y: round(sidebarRect.y)
      }
    }
  })
}

async function expectNoBrowserPreviewData(page: Page): Promise<void> {
  expect(await page.getByRole('button', { name: '打开项目' }).count()).toBe(0)
  expect(await page.getByText('添加数据库终端').count()).toBe(0)
  expect(await page.getByText('添加测试终端').count()).toBe(0)
}
