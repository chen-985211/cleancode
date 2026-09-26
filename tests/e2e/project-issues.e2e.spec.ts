// @vitest-environment node
import { execFile } from 'node:child_process'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import type { ElectronApplication, Page } from 'playwright'
import { createE2eTerminalEnvironment } from '../support/e2eTerminal'
import { createGitHubCliFixture } from '../fixtures/contexts/project/githubCliFixture'
import {
  createE2eWorkbench,
  launchApp,
  teardownE2eScenario,
  expectDesktopRuntime,
  electronScenarioTimeoutMs,
  type E2eScenarioResources
} from '../support/e2eWorkbench'

const execute = promisify(execFile)

describe('project issues', () => {
  let resources: E2eScenarioResources = {}
  let app: ElectronApplication
  let page: Page
  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name,
      cleanupWorkbenchArtifacts: async ({ projectDirectory }) => {
        await rm(join(dirname(projectDirectory), 'worktrees', basename(projectDirectory)), {
          recursive: true,
          force: true
        })
      }
    })
  })
  beforeEach(async () => {
    const workbench = await createE2eWorkbench('cleancode-issues')
    resources = { workbench }
    const git = (args: string[]) =>
      execute('git', args, { cwd: workbench.projectDirectory, timeout: 10000 })
    await git(['init', '-b', 'main'])
    await git(['config', 'user.name', 'Fixture'])
    await git(['config', 'user.email', 'fixture@example.test'])
    await git(['config', 'commit.gpgsign', 'false'])
    await writeFile(join(workbench.projectDirectory, 'README.md'), 'Base branch')
    await git(['add', '.'])
    await git(['commit', '-m', 'base'])
    await git(['remote', 'add', 'origin', 'https://github.com/fixture/issues.git'])
    await git([
      'config',
      `url.${pathToFileURL(workbench.projectDirectory).href}.insteadOf`,
      'https://github.com/fixture/issues.git'
    ])
    await git(['checkout', '-b', 'unrelated'])
    await writeFile(join(workbench.projectDirectory, 'unrelated.txt'), 'Other work')
    await git(['add', '.'])
    await git(['commit', '-m', 'unrelated'])
  }, electronScenarioTimeoutMs)
  async function launch(issuesError?: string) {
    const workbench = resources.workbench!
    const environment = await createGitHubCliFixture(
      join(workbench.registryDirectory, 'bin'),
      issuesError
    )
    app = await launchApp(workbench, { environment: createE2eTerminalEnvironment(environment) })
    resources.electronApp = app
    page = await app.firstWindow()
    resources.page = page
    await expectDesktopRuntime(page)
    await page.getByRole('button', { name: '添加项目', exact: true }).click()
  }
  it(
    'explains disabled Issues and preserves the repository across the Electron boundary',
    async () => {
      await launch("the 'fixture/issues' repository has disabled issues")
      await page.getByRole('button', { name: '任务', exact: true }).click()
      const panel = page.getByRole('complementary', { name: '任务', exact: true })
      const alert = panel.getByRole('alert')
      await alert.waitFor()
      expect(await alert.locator('p').textContent()).toBe(
        '可以在顶部选择其他 GitHub 仓库作为任务来源。'
      )
      expect(await panel.getByText('fixture/issues', { exact: true }).count()).toBe(1)
      expect(await panel.getByText('没有符合条件的未关闭 Issue', { exact: true }).count()).toBe(0)
      await page.screenshot({ path: 'test-results/project-issues-disabled.png' })
      expect(await alert.getByRole('heading', { name: '此仓库未开启 Issues' }).count()).toBe(1)
      const before = await panel.locator('.project-issues__list').boundingBox()
      await panel.getByRole('button', { name: 'fixture/issues', exact: true }).click()
      const repositoryInput = panel.getByRole('textbox', { name: 'GitHub 仓库', exact: true })
      await repositoryInput.waitFor()
      expect(await repositoryInput.evaluate((element) => Boolean(element.closest('header')))).toBe(
        true
      )
      const during = await panel.locator('.project-issues__list').boundingBox()
      expect(during!.y).toBe(before!.y)
      await page.screenshot({ path: 'test-results/project-issues-inline-repository.png' })
      await repositoryInput.fill('discard/repository')
      await repositoryInput.press('Escape')
      expect(await panel.getByRole('heading', { name: '任务', exact: true }).count()).toBe(0)
      await panel.getByRole('button', { name: 'fixture/issues', exact: true }).click()
      expect(await repositoryInput.inputValue()).toBe('fixture/issues')
      await repositoryInput.fill('discard/another')
      const search = panel.getByRole('searchbox')
      await search.click()
      await repositoryInput.waitFor({ state: 'hidden' })
      expect(await search.evaluate((element) => document.activeElement === element)).toBe(true)
      await panel.getByRole('button', { name: 'fixture/issues', exact: true }).click()
      expect(await repositoryInput.inputValue()).toBe('fixture/issues')
      await repositoryInput.press('Enter')
      await repositoryInput.waitFor({ state: 'hidden' })
      expect(await panel.locator('.project-issues__list').boundingBox()).toEqual(before)
    },
    electronScenarioTimeoutMs
  )
  it(
    'creates an isolated issue workspace from the default branch and reopens the same workspace',
    async () => {
      await launch()
      const workbench = resources.workbench!
      const git = (args: string[]) => execute('git', args, { cwd: workbench.projectDirectory })
      await page.getByRole('button', { name: '任务', exact: true }).click()
      await page.locator('.task-surface[data-surface-motion-state="open"]').waitFor()
      const workspace = page.locator('.app-shell__workspace')
      expect(await workspace.evaluate((element) => (element as HTMLElement).inert)).toBe(true)
      await page.getByRole('button', { name: 'Fix terminal resizing', exact: true }).waitFor()
      const searchInput = page.getByRole('searchbox')
      expect(await searchInput.evaluate((element) => element === document.activeElement)).toBe(
        false
      )
      const selectorSurfaces = await page
        .locator('.project-issues__select')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const style = getComputedStyle(element)
            return {
              borderWidth: style.borderTopWidth,
              border: style.borderTopColor,
              background: style.backgroundColor
            }
          })
        )
      expect(selectorSurfaces).toHaveLength(2)
      for (const surface of selectorSurfaces) {
        expect(surface.borderWidth).toBe('1px')
        expect(surface.border).not.toBe('rgba(0, 0, 0, 0)')
        expect(surface.background).not.toBe('rgba(0, 0, 0, 0)')
      }
      await page.screenshot({ path: 'test-results/project-issues-list.png' })
      await page.getByRole('button', { name: '标签', exact: true }).click()
      const labels = page.getByRole('menu', { name: '标签', exact: true })
      await page.locator('.project-issues-menu[data-surface-motion-state="open"]').waitFor()
      expect(
        await labels.getByRole('menuitemradio', { name: '全部标签' }).getAttribute('aria-checked')
      ).toBe('true')
      const highlight = labels.locator('.menu-option-highlight-motion')
      expect(await highlight.getAttribute('data-visible')).not.toBe('true')
      const menuBounds = await labels.boundingBox()
      const triggerBounds = await page
        .getByRole('button', { name: '标签', exact: true })
        .boundingBox()
      expect(menuBounds!.y).toBeCloseTo(triggerBounds!.y + triggerBounds!.height + 6, 0)
      expect(await labels.evaluate((element) => getComputedStyle(element).position)).toBe('fixed')
      await page.screenshot({ path: 'test-results/project-issues-label-menu.png' })
      await labels.getByRole('menuitemradio', { name: 'bug', exact: true }).click()
      expect(await page.getByRole('button', { name: '标签', exact: true }).textContent()).toBe(
        'bug'
      )
      await page.getByRole('button', { name: '标签', exact: true }).click()
      await page.locator('.project-issues-menu[data-surface-motion-state="open"]').waitFor()
      expect(await highlight.getAttribute('data-visible')).not.toBe('true')
      const allLabels = labels.getByRole('menuitemradio', { name: '全部标签' })
      await allLabels.hover()
      await labels
        .locator('.menu-option-highlight-motion[data-visible="true"][data-motion-state="idle"]')
        .waitFor()
      const rowBounds = await allLabels.boundingBox()
      const highlightBounds = await highlight.boundingBox()
      expect(highlightBounds!.y).toBeCloseTo(rowBounds!.y, 0)
      expect(highlightBounds!.height).toBeCloseTo(rowBounds!.height, 0)
      expect(
        await labels
          .getByRole('menuitemradio', { name: 'bug', exact: true })
          .getAttribute('aria-checked')
      ).toBe('true')
      await page.screenshot({ path: 'test-results/project-issues-menu-hover.png' })
      await page.getByRole('button', { name: '标签', exact: true }).hover()
      expect(await highlight.getAttribute('data-visible')).not.toBe('true')
      await labels.press('Escape')
      await page.getByRole('button', { name: 'Fix terminal resizing', exact: true }).click()
      await page.getByRole('heading', { name: 'Fix terminal resizing' }).waitFor()
      await page
        .getByText('Expected: the terminal keeps the correct dimensions and remains responsive.', {
          exact: false
        })
        .waitFor()
      const pages = page.locator('.project-issues__pages')
      await page.locator('.project-issues__pages[data-page-motion-state="open"]').waitFor()
      const reader = await page.locator('.project-issues__reader').elementHandle()
      const projectBounds = await page.locator('.project-issues__project').boundingBox()
      const navigationBounds = await page.locator('.project-issues__detail-nav').boundingBox()
      const bodyBounds = await page.locator('.project-issues__body').boundingBox()
      expect(navigationBounds!.x).toBeCloseTo(projectBounds!.x, 0)
      expect(bodyBounds!.x).toBeCloseTo(projectBounds!.x, 0)
      await page.getByRole('button', { name: '返回任务列表' }).click()
      expect(await pages.getAttribute('data-page-motion-state')).toBe('closing')
      expect(await reader!.evaluate((element) => element.isConnected)).toBe(true)
      expect(
        await page
          .locator('.project-issues__detail-page')
          .evaluate((el) => (el as HTMLElement).inert)
      ).toBe(true)
      // Dispatch a second navigation before the first spring has finished.
      await page
        .getByRole('button', { name: 'Fix terminal resizing', exact: true })
        .evaluate((el) => (el as HTMLButtonElement).click())
      expect(await reader!.evaluate((element) => element.isConnected)).toBe(true)
      await page.locator('.project-issues__pages[data-page-motion-state="open"]').waitFor()
      await mkdir('test-results', { recursive: true })
      await page.screenshot({ path: 'test-results/project-issues-light.png' })
      await page.locator('.project-issues__pages[data-page-motion-state="open"]').waitFor()
      const bodyBefore = await page.locator('.project-issues__body').boundingBox()
      await page.getByRole('button', { name: '开始处理', exact: true }).click()
      await page
        .locator('.project-issues__start-popover[data-surface-motion-state="open"]')
        .waitFor()
      expect(await page.locator('.project-issues__body').boundingBox()).toEqual(bodyBefore)
      await page.screenshot({ path: 'test-results/project-issues-create-popover.png' })
      await page.getByRole('textbox', { name: '分支名称' }).press('Escape')
      await page.getByRole('dialog', { name: '开始处理' }).waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: '开始处理', exact: true }).click()
      await page.getByRole('heading', { name: 'Fix terminal resizing' }).click()
      await page.getByRole('dialog', { name: '开始处理' }).waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: '开始处理', exact: true }).click()
      await page.getByRole('button', { name: '创建并开始', exact: true }).click()
      await page
        .getByRole('button', { name: 'issue/42-fix-terminal-resizing 独立工作区', exact: true })
        .waitFor()
      const snapshot = await page.evaluate(async () => {
        const items = await window.cleancode!.listWorkbenches()
        return items[0]!.project
      })
      const task = snapshot.workspaces.find((item) => item.issue?.number === 42)!
      expect(task).toBeDefined()
      expect(task.gitBranch).toBe('issue/42-fix-terminal-resizing')
      await expect(access(join(task.directory, 'unrelated.txt'))).rejects.toMatchObject({
        code: 'ENOENT'
      })
      expect((await git(['branch', '--show-current'])).stdout.trim()).toBe('unrelated')
      await page.getByRole('button', { name: '任务', exact: true }).click()
      await page.getByRole('button', { name: '打开工作区', exact: true }).waitFor()
      await page.emulateMedia({ colorScheme: 'dark' })
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]!.setSize(850, 720)
      })
      const panel = page.getByRole('complementary', { name: '任务', exact: true })
      await page.locator('.task-surface[data-surface-motion-state="open"]').waitFor()
      const bounds = await panel.boundingBox()
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      expect(bounds!.x).toBe(280)
      expect(bounds!.y).toBe(0)
      expect(bounds!.height).toBe(viewport.height)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
      await page.locator('.project-issues__pages[data-page-motion-state="open"]').waitFor()
      await page.screenshot({ path: 'test-results/project-issues-dark-narrow.png' })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.getByRole('button', { name: '返回任务列表' }).click()
      expect(await pages.getAttribute('data-page-motion-state')).toBe('closed')
      expect(await page.locator('.project-issues__reader').count()).toBe(0)
      await page.getByRole('button', { name: 'Fix terminal resizing', exact: true }).click()
      expect(await pages.getAttribute('data-page-motion-state')).toBe('open')
      await page.getByRole('button', { name: '打开工作区', exact: true }).click()
      const after = await page.evaluate(
        async () => (await window.cleancode!.listWorkbenches())[0]!.project
      )
      expect(
        after.workspaces.filter((item) => item.issue?.number === 42).map((item) => item.workspaceId)
      ).toEqual([task.workspaceId])
      await panel.waitFor({ state: 'hidden' })
      const defaultWorkspace = page.getByRole('button', { name: '切换到默认工作区 unrelated' })
      const taskWorkspace = page.getByRole('button', {
        name: 'issue/42-fix-terminal-resizing 独立工作区',
        exact: true
      })
      for (const input of ['pointer', 'keyboard']) {
        await defaultWorkspace.click()
        await defaultWorkspace.and(page.locator('[aria-current="page"]')).waitFor()
        await page.getByRole('button', { name: '任务', exact: true }).click()
        if (await panel.getByRole('button', { name: '返回任务列表' }).count())
          await panel.getByRole('button', { name: '返回任务列表' }).click()
        const link = panel.getByRole('button', {
          name: '打开工作区 issue/42-fix-terminal-resizing',
          exact: true
        })
        await link.waitFor()
        expect(await panel.getByRole('heading', { name: 'Fix terminal resizing' }).count()).toBe(0)
        if (input === 'pointer') {
          await link.hover()
          await page.screenshot({ path: 'test-results/project-issues-workspace-link.png' })
          await link.click()
        } else {
          await panel.getByRole('button', { name: 'Fix terminal resizing', exact: true }).focus()
          await page.keyboard.press('Tab')
          expect(await link.evaluate((element) => document.activeElement === element)).toBe(true)
          await page.keyboard.press('Enter')
        }
        await panel.waitFor({ state: 'hidden' })
        await taskWorkspace.and(page.locator('[aria-current="page"]')).waitFor()
        expect(await workspace.evaluate((element) => (element as HTMLElement).inert)).toBe(false)
      }
      const reopened = await page.evaluate(
        async () => (await window.cleancode!.listWorkbenches())[0]!.project
      )
      expect(reopened.workspaces.map((item) => item.workspaceId)).toEqual(
        after.workspaces.map((item) => item.workspaceId)
      )
    },
    electronScenarioTimeoutMs
  )
})
