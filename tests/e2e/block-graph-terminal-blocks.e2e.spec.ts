// @vitest-environment node

import type { ElectronApplication, Page } from 'playwright'

import {
  buildElectronApp,
  cleanupE2eWorkbench,
  clickLocatorCenter,
  createE2eWorkbench,
  electronBuildTimeoutMs,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  expectMinimapCanFocusTerminal,
  expectNewTerminalIsFocused,
  expectTerminalBlocksDoNotOverlap,
  expectTerminalLooksLikePlainShell,
  launchApp,
  readOnlyJsonFile,
  type E2eWorkbench,
  type TerminalBlockRecord
} from '../support/e2eWorkbench'

describe('block graph terminal blocks e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page

  beforeAll(async () => {
    await buildElectronApp()
  }, electronBuildTimeoutMs)

  beforeEach(async () => {
    workbench = await createE2eWorkbench('cleancode-block-graph-e2e')
    electronApp = await launchApp(workbench)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async () => {
    await electronApp.close()
    await cleanupE2eWorkbench(workbench)
  })

  it(
    'creates, updates, focuses, and deletes a terminal block',
    async () => {
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await expectTerminalLooksLikePlainShell(page)
      await expectNewTerminalIsFocused(page)
      await expectMinimapCanFocusTerminal(page, 'Terminal 1')

      await page.getByRole('button', { name: 'Terminal 1 编辑终端信息' }).click()
      await page.getByLabel('终端名称').fill('API Server')
      await page.getByLabel('终端描述').fill('Runs backend tasks')
      await page.getByRole('button', { name: '保存终端信息' }).click()
      await page.getByText('API Server').waitFor()
      await page.getByText('Runs backend tasks').waitFor()

      const editedGraph = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ type: string; name: string; description: string }>
      }

      expect(editedGraph.blocks[0]).toMatchObject({
        type: 'terminal',
        name: 'API Server',
        description: 'Runs backend tasks'
      })

      await clickLocatorCenter(page, page.getByRole('button', { name: 'API Server 删除终端' }))
      await page.getByText('API Server').waitFor({ state: 'detached' })

      const graphAfterDelete = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ type: string }>
      }

      expect(graphAfterDelete.blocks).toHaveLength(0)
    },
    electronScenarioTimeoutMs
  )

  it(
    'places newly created terminal blocks without overlapping existing blocks',
    async () => {
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: '添加项目' }).click()

      for (let terminalIndex = 1; terminalIndex <= 5; terminalIndex += 1) {
        await page.getByRole('button', { name: '新建终端积木' }).click()
        await page.getByText(`Terminal ${terminalIndex}`).waitFor()
      }

      const graph = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'default-graph.json')
      ) as {
        blocks: TerminalBlockRecord[]
      }

      expect(graph.blocks).toHaveLength(5)
      expectTerminalBlocksDoNotOverlap(graph.blocks)
    },
    electronScenarioTimeoutMs
  )
})
