// @vitest-environment node
import {
  closeElectronApp,
  createE2eWorkbench,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources
} from '../support/e2eWorkbench'

describe('project to-do list', () => {
  let resources: E2eScenarioResources = {}
  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  })

  it(
    'keeps the canvas in place and restores pasted references after restarting Electron',
    async () => {
      const workbench = await createE2eWorkbench('cleancode-project-todos')
      resources = { workbench }
      async function launch() {
        const app = await launchApp(workbench)
        resources.electronApp = app
        const page = await app.firstWindow()
        resources.page = page
        await expectDesktopRuntime(page)
        return page
      }
      let page = await launch()
      await page.getByRole('button', { name: '添加项目', exact: true }).click()
      const opener = page.getByRole('button', { name: '打开待办清单', exact: true })
      const canvas = page.locator('.react-flow').first()
      await opener.waitFor({ timeout: 5000 })
      const anchor = await opener.boundingBox()
      const before = await canvas.boundingBox()
      await opener.click()
      expect(await canvas.boundingBox()).toEqual(before)
      expect(await page.getByRole('button', { name: '收起待办清单' }).boundingBox()).toEqual(anchor)
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
      await closeElectronApp(resources.electronApp!)
      page = await launch()
      await page.getByRole('button', { name: '打开待办清单' }).click()
      await page.getByRole('button', { name: '调整筛选栏', exact: true }).click()
      expect(await page.getByRole('link', { name: /example.org/ }).getAttribute('href')).toBe(
        'https://example.org/filter'
      )
      const img = page.getByRole('img', { name: '粘贴的截图' })
      await img.evaluate(async (node) => {
        await (node as HTMLImageElement).decode()
      })
      expect(await img.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(1)
    },
    electronScenarioTimeoutMs
  )
})
