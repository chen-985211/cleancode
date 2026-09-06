// @vitest-environment node
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { Page } from 'playwright'
import { BlockGraph } from '../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { createBlockTemplate } from '../../src/contexts/block-graph/domain/services/BlockTemplateProjection'
import { FileSystemBlockTemplateRepository } from '../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockTemplateRepository'
import { installFakeClaudeCli } from '../fixtures/contexts/agent/fakeClaudeCli'
import { installFakeCodexCli } from '../fixtures/contexts/agent/fakeCodexCli'
import {
  createE2eWorkbench,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources
} from '../support/e2eWorkbench'
import {
  createE2eNodeCommand,
  createE2eTerminalEnvironment,
  prependE2ePath
} from '../support/e2eTerminal'
import { pollUntilState } from '../support/e2ePolling'

const execFileAsync = promisify(execFile)

describe('workspace default contents e2e', () => {
  let resources: E2eScenarioResources
  let page: Page
  beforeEach(async () => {
    const workbench = await createE2eWorkbench('cleancode-defaults-e2e')
    resources = { workbench }
    for (const args of [
      ['init', '--initial-branch=main'],
      ['config', 'user.email', 'test@example.com'],
      ['config', 'user.name', 'Test User']
    ]) {
      await execFileAsync('git', args, { cwd: workbench.projectDirectory })
    }
    await writeFile(join(workbench.projectDirectory, 'README.md'), 'Workspace defaults fixture\n')
    await execFileAsync('git', ['add', 'README.md'], { cwd: workbench.projectDirectory })
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: workbench.projectDirectory })
    const templates = new FileSystemBlockTemplateRepository(
      join(workbench.appStateDirectory, 'block-template-library.json')
    )
    const graph = BlockGraph.createDefault({ projectId: 'fixture', workspaceId: 'fixture' })
    graph.createTerminalBlock({
      id: 'startup',
      name: 'Startup',
      description: '',
      position: { x: 0, y: 0 }
    })
    graph.updateTerminalBlockMetadata('startup', {
      name: 'Startup',
      description: '',
      launchCommand: createE2eNodeCommand(
        "require('node:fs').appendFileSync('initialized.txt', process.cwd() + '\\n')"
      )
    })
    graph.createTerminalBlock({
      id: 'notes',
      name: 'Notes',
      description: '',
      position: { x: 600, y: 0 }
    })
    await templates.transact((library) => {
      for (const id of ['startup', 'notes'])
        library.add(
          createBlockTemplate({
            graph: graph.toSnapshot(),
            id,
            name: id === 'startup' ? 'Startup' : 'Notes',
            description: '',
            createdAt: '2026-09-06',
            scope: { type: 'global' },
            selectedBlockIds: [id]
          })
        )
    })
    const fake = await installFakeCodexCli(workbench.appStateDirectory)
    const claude = await installFakeClaudeCli(workbench.appStateDirectory)
    resources.electronApp = await launchApp(workbench, {
      environment: {
        ...createE2eTerminalEnvironment(),
        PATH: prependE2ePath(fake.binDirectory, claude.binDirectory),
        CLEANCODE_FAKE_CLAUDE_REPORT_PATH: claude.reportPath,
        CLEANCODE_FAKE_CODEX_REPORT_PATH: fake.reportPath
      }
    })
    page = await resources.electronApp.firstWindow()
    resources.page = page
    await page.waitForLoadState('domcontentloaded')
    await expectDesktopRuntime(page)
    await page.getByRole('button', { name: '添加项目', exact: true }).click()
  }, electronScenarioTimeoutMs)

  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name,
      cleanupWorkbenchArtifacts: async (workbench) => {
        await rm(
          join(
            dirname(workbench.projectDirectory),
            'worktrees',
            basename(workbench.projectDirectory)
          ),
          { recursive: true, force: true }
        )
      }
    })
  })

  it(
    'configures defaults, creates fresh content in the worktree, and does not rerun it on reload',
    { timeout: electronScenarioTimeoutMs * 2 },
    async () => {
      const workbench = resources.workbench!
      await page.getByRole('button', { name: '设置', exact: true }).click()
      await page
        .getByRole('navigation', { name: '设置导航' })
        .getByRole('button', { name: '工作区', exact: true })
        .click()
      const editor = page.getByRole('form', { name: '工作区默认内容', exact: true })
      await configureDefaults()
      expect(await editor.getByRole('button', { name: '保存默认内容', exact: true }).count()).toBe(
        0
      )
      await pollUntilState({
        timeoutMs: 10_000,
        description: 'all edits saved without a save action',
        observe: () =>
          page.evaluate(
            async (directory) =>
              window.cleancode!.getWorkspaceDefaults({ projectDirectory: directory }),
            workbench.projectDirectory
          ),
        accept: (defaults) =>
          defaults.agents.length === 2 &&
          defaults.agents[0].count === 2 &&
          defaults.templates.length === 2 &&
          defaults.templates[0].runAfterPlacement
      })
      await pollUntilState({
        timeoutMs: 5_000,
        description: 'settings motion settled before visual review',
        observe: () =>
          page
            .locator(
              '.workspace-defaults-row-motion[data-defaults-row-motion="opening"], .workspace-defaults-row-motion[data-defaults-row-motion="closing"], .workspace-defaults-picker[data-surface-motion-state="closing"]'
            )
            .count(),
        accept: (count) => count === 0
      })
      await mkdir('test-results/workspace-defaults', { recursive: true })
      await page.screenshot({ path: 'test-results/workspace-defaults/editor.png' })
      const projectSwitcher = page.getByRole('button', { name: /^切换项目：/ })
      await projectSwitcher.click()
      await page
        .locator('.workspace-defaults-project-menu[data-surface-spring-state="open"]')
        .waitFor()
      await page.screenshot({ path: 'test-results/workspace-defaults/project-picker.png' })
      await page.keyboard.press('Tab')
      await page.locator('.workspace-defaults-project-menu').waitFor({ state: 'detached' })
      expect(
        await editor
          .getByRole('button', { name: '添加 Agent', exact: true })
          .evaluate((button) => button === document.activeElement)
      ).toBe(true)
      for (const colorScheme of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme })
        await page.locator(`html[data-theme="${colorScheme}"]`).waitFor()
        await page.locator('.application-settings-surface').evaluate(async (surface) => {
          await Promise.all(
            surface.getAnimations({ subtree: true }).map((animation) => animation.finished)
          )
        })
        if (colorScheme === 'dark')
          await page.screenshot({ path: 'test-results/workspace-defaults/editor-dark.png' })
      }
      const originalSize = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight
      }))
      await page.setViewportSize({ width: 720, height: 560 })
      await editor.getByRole('button', { name: '添加模板', exact: true }).scrollIntoViewIfNeeded()
      await editor.getByRole('button', { name: '添加模板', exact: true }).click()
      await page.getByRole('menu', { name: '添加模板', exact: true }).waitFor()
      const pickerBounds = await page
        .getByRole('menu', { name: '添加模板', exact: true })
        .boundingBox()
      expect(pickerBounds!.x).toBeGreaterThanOrEqual(0)
      expect(pickerBounds!.y + pickerBounds!.height).toBeLessThanOrEqual(560)
      await page.keyboard.press('Escape')
      await page.getByRole('menu', { name: '添加模板', exact: true }).waitFor({ state: 'hidden' })
      await page.locator('.workspace-defaults-picker').waitFor({ state: 'detached' })
      await page.screenshot({ path: 'test-results/workspace-defaults/editor-narrow.png' })
      await page.setViewportSize(originalSize)
      await page.getByRole('button', { name: '返回工作区', exact: true }).click()
      await editor.waitFor({ state: 'hidden' })
      await createWorktree('feature/defaults')
      await pollUntilState({
        timeoutMs: 15_000,
        description: 'all default objects on the worktree canvas',
        observe: () => page.locator('.react-flow__node').count(),
        accept: (count) => count === 5
      })
      const targetDirectory = join(
        dirname(workbench.projectDirectory),
        'worktrees',
        basename(workbench.projectDirectory),
        'feature',
        'defaults'
      )
      await pollUntilState({
        timeoutMs: 15_000,
        description: 'startup template executed in its new worktree',
        observe: () => readFile(join(targetDirectory, 'initialized.txt'), 'utf8').catch(() => ''),
        accept: (value) => value === `${targetDirectory}\n`
      })
      await page.screenshot({ path: 'test-results/workspace-defaults/canvas.png' })
      const first = await readCurrentWorkspace()
      expect(first?.initialization?.stage).toBe('complete')
      expect(first?.agents).toHaveLength(3)
      expect(new Set(first?.agents?.map((agent) => agent.agentId)).size).toBe(3)
      expect(first?.agents?.map((agent) => agent.providerId).sort()).toEqual([
        'claude-code',
        'codex',
        'codex'
      ])
      expect(first?.agents?.[0]).toMatchObject({
        providerId: 'codex',
        workspaceId: first?.graph.workspaceId
      })
      await page.reload()
      await pollUntilState({
        timeoutMs: 15_000,
        description: 'restored initialized canvas',
        observe: () => page.locator('.react-flow__node').count(),
        accept: (count) => count === 5
      })
      const restored = await readCurrentWorkspace()
      expect(restored?.graph.blocks.map((block) => block.id)).toEqual(
        first?.graph.blocks.map((block) => block.id)
      )
      expect(await readFile(join(targetDirectory, 'initialized.txt'), 'utf8')).toBe(
        `${targetDirectory}\n`
      )

      await openWorkspaceSettings()
      for (const name of ['Codex', 'Claude Code', 'Startup', 'Notes']) {
        await editor.getByRole('button', { name: `移除 ${name}`, exact: true }).click()
      }
      await pollUntilState({
        timeoutMs: 10_000,
        description: 'empty project defaults saved',
        observe: () =>
          page.evaluate(
            (directory) => window.cleancode!.getWorkspaceDefaults({ projectDirectory: directory }),
            workbench.projectDirectory
          ),
        accept: (defaults) => defaults.agents.length === 0 && defaults.templates.length === 0
      })
      await page.getByRole('button', { name: '返回工作区', exact: true }).click()
      await editor.waitFor({ state: 'hidden' })
      await createWorktree('feature/blank')
      await pollUntilState({
        timeoutMs: 15_000,
        description: 'empty project defaults create an empty worktree automatically',
        observe: readCurrentWorkspace,
        accept: (value) =>
          value?.project.workspaces.some(
            (item) => item.isCurrent && item.gitBranch === 'feature/blank'
          ) === true
      })
      expect((await readCurrentWorkspace())?.graph.blocks).toEqual([])
      expect(await page.getByText('空白画布', { exact: true }).count()).toBe(0)
      expect(await page.getByRole('button', { name: '配置默认内容', exact: true }).count()).toBe(0)
      await page.screenshot({ path: 'test-results/workspace-defaults/blank-canvas.png' })
      await openWorkspaceSettings()
      await configureDefaults()
      await editor.getByRole('spinbutton', { name: 'Codex 数量', exact: true }).fill('3')
      await editor.getByRole('spinbutton', { name: 'Codex 数量', exact: true }).fill('2')
      await pollUntilState({
        timeoutMs: 10_000,
        description: 'quantity edits finished saving',
        observe: () => editor.getAttribute('aria-busy'),
        accept: (busy) => busy === 'false'
      })
      expect((await readCurrentWorkspace())?.graph.blocks).toEqual([])
      await page.getByRole('button', { name: '返回工作区', exact: true }).click()
      await editor.waitFor({ state: 'hidden' })
      await createWorktree('feature/after-settings')
      await pollUntilState({
        timeoutMs: 15_000,
        description: 'saved settings applied to a later new worktree',
        observe: () => page.locator('.react-flow__node').count(),
        accept: (count) => count === 5
      })
    }
  )

  async function openWorkspaceSettings() {
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page
      .getByRole('navigation', { name: '设置导航' })
      .getByRole('button', { name: '工作区', exact: true })
      .click()
  }
  async function configureDefaults() {
    const editor = page.getByRole('form', { name: '工作区默认内容', exact: true })
    await editor.getByRole('button', { name: '添加 Agent', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Codex', exact: true }).click()
    await editor.getByRole('button', { name: '增加 Codex 数量', exact: true }).click()
    await editor.getByRole('button', { name: '添加 Agent', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Claude Code', exact: true }).click()
    for (const name of ['Startup', 'Notes']) {
      await editor.getByRole('button', { name: '添加模板', exact: true }).click()
      await page
        .getByRole('group', { name: '全局', exact: true })
        .getByRole('menuitem', { name, exact: true })
        .click()
    }
    await editor.getByRole('switch', { name: '自动运行 Startup', exact: true }).click()
  }

  async function createWorktree(branch: string) {
    await page.locator('.application-settings-surface').waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '新建分支工作区', exact: true }).click()
    const form = page.getByRole('dialog', { name: '新建分支工作区', exact: true })
    await form.getByLabel('分支名称').fill(branch)
    expect(await form.getByRole('button').count()).toBe(1)
    if (branch === 'feature/defaults') {
      await page
        .locator('.branch-workspace-surface[data-branch-workspace-spring-state="open"]')
        .waitFor()
      await page.screenshot({ path: 'test-results/workspace-defaults/create-branch.png' })
    }
    await form.getByRole('button', { name: '创建 Worktree', exact: true }).click()
    await form.waitFor({ state: 'hidden' })
  }
  async function readCurrentWorkspace() {
    return page.evaluate(
      async () =>
        (await window.cleancode?.listWorkbenches())?.find((item) => item.isCurrentProject) ?? null
    )
  }
})
