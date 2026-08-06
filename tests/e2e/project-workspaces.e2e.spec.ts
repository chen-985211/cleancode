// @vitest-environment node

import { mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  closeElectronApp,
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  pathExists,
  selectBlankCanvasAction,
  teardownE2eScenario,
  waitForJsonFile,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { waitForE2eBlockGraph } from '../support/e2eBlockGraph'
import { pollUntilState } from '../support/e2ePolling'

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
      if (process.platform === 'win32') {
        expect(
          await electronApp.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0]?.isMenuBarVisible()
          )
        ).toBe(false)
      }
      const titlebarNavigation = page.getByRole('navigation', { name: '窗口导航' })
      const sidebar = page.locator('#project-sidebar')
      const collapseSidebar = titlebarNavigation.getByRole('button', { name: '收起侧边栏' })
      const windowedTitlebarInset = process.platform === 'darwin' ? 80 : 12

      await waitForSidebarTitlebarGeometry(page, 'windowed sidebar titlebar geometry', {
        button: { height: 24, width: 32, x: windowedTitlebarInset, y: 6 },
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
          width: 280,
          y: 36
        }
      })

      await collapseSidebar.click()

      await waitForSidebarVisibilityState(sidebar, 'true')
      const expandSidebar = titlebarNavigation.getByRole('button', { name: '展开侧边栏' })
      await expandSidebar.waitFor()
      await waitForSidebarTitlebarGeometry(page, 'collapsed windowed titlebar geometry', {
        button: { height: 24, width: 32, x: windowedTitlebarInset, y: 6 },
        buttonOwnsHitTarget: true,
        navigationBoundary: {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          borderRightWidth: '0px',
          boxShadow: 'none'
        },
        navigation: { height: 36, width: windowedTitlebarInset + 32, x: 0, y: 0 },
        sidebar: {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          borderRightWidth: '0px',
          width: 0
        }
      })
      await expandSidebar.click()

      await waitForSidebarVisibilityState(sidebar, null)
      await titlebarNavigation.getByRole('button', { name: '收起侧边栏' }).waitFor()

      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.emit('enter-full-screen')
      })
      await waitForSidebarTitlebarGeometry(page, 'fullscreen sidebar titlebar geometry', {
        button: { height: 24, width: 32, x: 0, y: 6 },
        buttonOwnsHitTarget: true,
        navigation: { height: 36, x: 0, y: 0 },
        sidebar: { width: 280 }
      })

      await titlebarNavigation.getByRole('button', { name: '收起侧边栏' }).click()
      await waitForSidebarVisibilityState(sidebar, 'true')
      await waitForSidebarTitlebarGeometry(page, 'collapsed fullscreen titlebar geometry', {
        button: { height: 24, width: 32, x: 0, y: 6 },
        buttonOwnsHitTarget: true,
        navigation: { height: 36, width: 32, x: 0, y: 0 }
      })
      await titlebarNavigation.getByRole('button', { name: '展开侧边栏' }).click()
      await waitForSidebarVisibilityState(sidebar, null)

      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.emit('leave-full-screen')
      })
      await waitForSidebarTitlebarGeometry(page, 'restored windowed titlebar geometry', {
        button: { height: 24, width: 32, x: windowedTitlebarInset, y: 6 },
        buttonOwnsHitTarget: true,
        navigation: { height: 36, x: 0, y: 0 },
        sidebar: { width: 280 }
      })
    },
    electronScenarioTimeoutMs
  )

  it(
    'scrolls overflowing projects inside the sidebar',
    async () => {
      await expectDesktopRuntime(page)

      for (let index = 1; index <= 8; index += 1) {
        const projectName = `sidebar-project-${index}`
        const projectDirectory = join(workbench.projectDirectory, projectName)
        await mkdir(projectDirectory)
        await electronApp.evaluate((_electron, directory) => {
          process.env.CLEANCODE_TEST_PROJECT_DIRECTORY = directory
        }, projectDirectory)
        await page.getByRole('button', { name: '添加项目' }).click()
        await page.getByRole('button', { name: projectName, exact: true }).waitFor()
      }

      const projectList = page.locator('.project-list')
      const initialGeometry = await projectList.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop
      }))
      expect(initialGeometry.scrollHeight).toBeGreaterThan(initialGeometry.clientHeight)
      expect(initialGeometry.scrollTop).toBe(0)

      await projectList.hover()
      await page.mouse.wheel(0, 360)

      const scrollTop = await pollUntilState({
        description: 'project list to scroll after a wheel gesture',
        observe: () => projectList.evaluate((element) => element.scrollTop),
        accept: (value) => value > 0,
        timeoutMs: 5_000
      })
      expect(scrollTop).toBeGreaterThan(0)
      await page.getByRole('button', { name: '添加项目' }).waitFor()
    },
    electronScenarioTimeoutMs
  )

  it(
    'creates and restores a local project workspace graph without fake runtime data',
    { tags: 'smoke', timeout: electronScenarioTimeoutMs },
    async () => {
      await expectDesktopRuntime(page)
      await expectEmptyProjectStateWithoutPreviewData(page)

      await page.getByRole('button', { name: '打开项目' }).click()
      await selectBlankCanvasAction(page, '新建终端积木')
      await page.getByText('Terminal 1').waitFor()

      const projectMetadata = JSON.parse(
        await waitForJsonFile(workbench.appStateDirectory, 'project.json')
      ) as { name: string; workspaces: Array<{ displayName: string }> }
      const graph = await waitForE2eBlockGraph(workbench)

      expect(await pathExists(join(workbench.projectDirectory, '.cleancode'))).toBe(false)
      expect(projectMetadata.name).toBe(basename(workbench.projectDirectory))
      expect(projectMetadata.workspaces.map((workspace) => workspace.displayName)).toEqual(['main'])
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
    readonly width: number
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
        width: round(sidebarRect.width),
        y: round(sidebarRect.y)
      }
    }
  })
}

type SidebarTitlebarGeometry = Awaited<ReturnType<typeof readSidebarTitlebarGeometry>>
type SidebarTitlebarGeometryExpectation = {
  readonly [
    Section in keyof SidebarTitlebarGeometry
  ]?: SidebarTitlebarGeometry[Section] extends object
    ? Partial<SidebarTitlebarGeometry[Section]>
    : SidebarTitlebarGeometry[Section]
}

async function waitForSidebarTitlebarGeometry(
  page: Page,
  description: string,
  expected: SidebarTitlebarGeometryExpectation
): Promise<void> {
  const geometry = await pollUntilState({
    description,
    observe: () => readSidebarTitlebarGeometry(page),
    accept: (observation) => matchesSidebarTitlebarGeometry(observation, expected),
    timeoutMs: 5_000
  })

  expect(geometry).toMatchObject(expected)
}

function matchesSidebarTitlebarGeometry(
  geometry: SidebarTitlebarGeometry,
  expected: SidebarTitlebarGeometryExpectation
): boolean {
  return Object.entries(expected).every(([section, sectionExpectation]) => {
    const actualSection = geometry[section as keyof SidebarTitlebarGeometry]
    if (typeof sectionExpectation !== 'object' || sectionExpectation === null) {
      return actualSection === sectionExpectation
    }
    if (typeof actualSection !== 'object' || actualSection === null) return false

    return Object.entries(sectionExpectation).every(
      ([property, value]) =>
        (actualSection as unknown as Record<string, unknown>)[property] === value
    )
  })
}

async function waitForSidebarVisibilityState(
  sidebar: Locator,
  expectedAriaHidden: string | null
): Promise<void> {
  const ariaHidden = await pollUntilState({
    description:
      expectedAriaHidden === null ? 'project sidebar to become visible' : 'project sidebar to hide',
    observe: () => sidebar.getAttribute('aria-hidden'),
    accept: (value) => value === expectedAriaHidden,
    timeoutMs: 5_000
  })

  expect(ariaHidden).toBe(expectedAriaHidden)
}

async function expectEmptyProjectStateWithoutPreviewData(page: Page): Promise<void> {
  await page.getByRole('heading', { name: '打开项目开始使用' }).waitFor()
  expect(await page.getByRole('button', { name: '打开项目' }).count()).toBe(1)
  expect(await page.getByText('添加数据库终端').count()).toBe(0)
  expect(await page.getByText('添加测试终端').count()).toBe(0)
}
