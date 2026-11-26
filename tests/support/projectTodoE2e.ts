import type { Page } from 'playwright'
import {
  closeElectronApp,
  createE2eWorkbench,
  expectDesktopRuntime,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources
} from './e2eWorkbench'

export async function startProjectTodoScenario() {
  const workbench = await createE2eWorkbench('cleancode-project-todo')
  const resources: E2eScenarioResources = { workbench }
  onTestFinished(({ task }) =>
    teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  )

  async function launch() {
    const app = await launchApp(workbench)
    resources.electronApp = app
    const page = await app.firstWindow()
    resources.page = page
    await expectDesktopRuntime(page)
    return { app, page }
  }

  const desktop = await launch()
  await desktop.page.getByRole('button', { name: '添加项目', exact: true }).click()
  return {
    ...desktop,
    async restart() {
      await closeElectronApp(resources.electronApp!)
      resources.electronApp = undefined
      resources.page = undefined
      return launch()
    }
  }
}

export async function captureTodoWithReferences(page: Page) {
  await page.getByRole('button', { name: '打开待办清单' }).click()
  await page.getByRole('button', { name: '记一条' }).click()
  const title = page.getByRole('textbox', { name: '待办内容' })
  await title.fill('调整筛选栏')
  await title.evaluate((el) => {
    const data = new DataTransfer()
    data.setData('text/plain', 'https://example.org/filter')
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6qUAAAAASUVORK5CYII='
      ),
      (c) => c.charCodeAt(0)
    )
    data.items.add(new File([bytes], 'filter.png', { type: 'image/png' }))
    el.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
    )
  })
  await page.getByRole('img', { name: '粘贴的截图' }).waitFor()
  await title.press('Escape')
}
