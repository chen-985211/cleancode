// @vitest-environment node
import { pollUntilState } from '../support/e2ePolling'
import { electronScenarioTimeoutMs } from '../support/e2eWorkbench'
import { captureTodoWithReferences, startProjectTodoScenario } from '../support/projectTodoE2e'

it(
  'restores pasted references after restart and opens their URL via pointer or keyboard',
  async () => {
    const desktop = await startProjectTodoScenario()
    await captureTodoWithReferences(desktop.page)
    const { app, page } = await desktop.restart()
    await page.getByRole('button', { name: '打开待办清单' }).click()
    const savedTitle = page.getByRole('button', { name: '调整筛选栏', exact: true })
    await savedTitle.waitFor()
    expect(await page.getByRole('link', { name: /example.org/ }).count()).toBe(0)
    expect(
      await page.locator('.todo-detail').evaluate((el) => el.getBoundingClientRect().height)
    ).toBe(0)
    await savedTitle.click()
    const editor = page.getByRole('textbox', { name: '待办内容' })
    expect(await page.getByRole('link', { name: /example.org/ }).getAttribute('href')).toBe(
      'https://example.org/filter'
    )
    const img = page.getByRole('img', { name: '粘贴的截图' })
    await img.evaluate(async (node) => {
      await (node as HTMLImageElement).decode()
    })
    expect(await img.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(1)
    const address = page.getByRole('link', { name: /example.org/ })
    await address.hover()
    expect(await page.getByRole('button', { name: /^编辑/ }).count()).toBe(0)
    const hostLabel = address.getByText('example.org', { exact: true })
    const iconBox = (await address.locator('.todo-link-icon').boundingBox())!
    const addressBox = (await hostLabel.boundingBox())!
    expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(addressBox.x)
    expect(await address.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none')
    const opened = await app.evaluateHandle(({ shell }) => {
      const urls: string[] = []
      shell.openExternal = async (url) => {
        urls.push(url)
      }
      return urls
    })
    const waitForOpenedUrls = (count: number) =>
      pollUntilState({
        description: 'the external link handler to receive ' + count + ' calls',
        observe: () => opened.jsonValue(),
        accept: (urls) => urls.length >= count,
        timeoutMs: 5000
      })
    await hostLabel.click()
    expect(await waitForOpenedUrls(1)).toEqual(['https://example.org/filter'])
    expect(await editor.inputValue()).toBe('调整筛选栏')
    await address.press('Enter')
    expect(await waitForOpenedUrls(2)).toEqual([
      'https://example.org/filter',
      'https://example.org/filter'
    ])
    await opened.dispose()
  },
  electronScenarioTimeoutMs
)
