// @vitest-environment node
import { pollUntilState } from '../support/e2ePolling'
import { electronScenarioTimeoutMs } from '../support/e2eWorkbench'
import { captureTodoWithReferences, startProjectTodoScenario } from '../support/projectTodoE2e'

it(
  'previews a screenshot within the window and returns to the same scrolled editor',
  async () => {
    const { page, app } = await startProjectTodoScenario()
    await page.getByRole('button', { name: '打开待办清单' }).click()
    await page.getByRole('button', { name: '记一条' }).click()
    const title = page.getByRole('textbox', { name: '待办内容' })
    for (let i = 1; i <= 24; i++) {
      await title.fill('检查截图 ' + i)
      await title.press('Enter')
    }
    await title.press('Escape')
    await page.getByRole('button', { name: '检查截图 2', exact: true }).click()
    const screenshot = await page.screenshot()
    await title.evaluate((el, png) => {
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
      const data = new DataTransfer()
      data.items.add(new File([bytes], 'workspace.png', { type: 'image/png' }))
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data }))
    }, screenshot.toString('base64'))

    await page.locator('.todo-expanded .todo-thumbnail').scrollIntoViewIfNeeded()
    const thumbnail = page.getByRole('button', { name: '放大查看截图' })
    const dialog = page.getByRole('dialog', { name: '截图预览' })
    const close = dialog.getByRole('button', { name: '关闭预览' })
    const scroll = page.locator('.todo-scroll')
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      await page.locator('html[data-theme="' + colorScheme + '"]').waitFor()
      if (colorScheme === 'dark') {
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.setContentSize(960, 640)
        )
      }
      await thumbnail.scrollIntoViewIfNeeded()
      const thumbnailBounds = (await thumbnail.boundingBox())!
      // Both pointer and keyboard activation dispatch a click after any scroll into view.
      const opening = await scroll.evaluateHandle((el) => {
        const position = { scrollTop: 0 }
        el.addEventListener(
          'click',
          () => {
            position.scrollTop = el.scrollTop
          },
          { capture: true, once: true }
        )
        return position
      })
      if (colorScheme === 'light') await thumbnail.click()
      else await thumbnail.press('Enter')
      await dialog.waitFor()
      if (process.platform !== 'darwin') {
        // Trial clicks verify the native caption hit areas without changing the window state.
        for (const action of ['close', 'minimize', 'maximize']) {
          await page.locator('.desktop-caption-' + action).click({ trial: true })
        }
      }
      const { scrollTop } = await opening.jsonValue()
      await opening.dispose()
      expect(scrollTop).toBeGreaterThan(0)
      const image = dialog.getByRole('img')
      const aspect = await image.evaluate(async (el: HTMLImageElement) => {
        await el.decode()
        return el.naturalWidth / el.naturalHeight
      })
      const box = (await image.boundingBox())!
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      expect(box.width / box.height).toBeCloseTo(aspect, 2)
      expect(box.width).toBeGreaterThan(thumbnailBounds.width)
      expect(box.x).toBeGreaterThan(0)
      expect(box.y).toBeGreaterThan(0)
      expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, 0)
      expect(box.y + box.height / 2).toBeCloseTo(viewport.height / 2, 0)
      await page.keyboard.press('Tab')
      expect(await close.evaluate((el) => el === document.activeElement)).toBe(true)
      await page.screenshot({ path: 'test-results/todo-image-preview/' + colorScheme + '.png' })
      if (colorScheme === 'light') await page.keyboard.press('Escape')
      else await dialog.click({ position: { x: 8, y: 80 } })
      await dialog.waitFor({ state: 'detached' })
      await thumbnail.and(page.locator(':focus')).waitFor()
      expect(await scroll.evaluate((el) => el.scrollTop)).toBe(scrollTop)
      expect(await title.inputValue()).toBe('检查截图 2')
    }
    await page.getByRole('button', { name: '移除截图' }).click()
    expect(await dialog.count()).toBe(0)
    expect(await thumbnail.count()).toBe(0)
  },
  electronScenarioTimeoutMs
)

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
    await page.getByRole('button', { name: '放大查看截图' }).click()
    const preview = page.getByRole('dialog', { name: '截图预览' })
    await preview.getByRole('button', { name: '关闭预览' }).click()
    await preview.waitFor({ state: 'detached' })
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

it(
  'opens the selected screenshot and pages through the same draft with the keyboard and buttons',
  async () => {
    const { page, app } = await startProjectTodoScenario()
    await page.evaluate(() => localStorage.setItem('cleancode:locale-preference', 'en'))
    await page.reload()
    await page.getByRole('button', { name: 'Open to-do list' }).click()
    await page.getByRole('button', { name: 'Add a to-do' }).click()
    const title = page.getByRole('textbox', { name: 'To-do text' })
    await title.fill('Review both captures')
    await title.evaluate(async (el) => {
      const data = new DataTransfer()
      for (const [width, height] of [
        [1200, 460],
        [460, 1200]
      ]) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#f4f4f2'
        ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#243044'
        ctx.font = '32px sans-serif'
        ctx.fillText(width + ' × ' + height, 24, 60)
        const png = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)))
        data.items.add(new File([png], width + '.png', { type: png.type }))
      }
      el.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
      )
    })

    const thumbnails = page.getByRole('button', { name: 'Enlarge screenshot' })
    const opener = thumbnails.nth(1)
    const dialog = page.getByRole('dialog', { name: 'Screenshot preview' })
    const previous = dialog.getByRole('button', { name: 'Previous image' })
    const next = dialog.getByRole('button', { name: 'Next image' })
    await opener.click()
    await dialog.getByText('2 of 2').waitFor()
    const image = dialog.getByRole('img')
    await page.keyboard.press('ArrowRight')
    await dialog.getByText('1 of 2').waitFor()
    expect(
      await image.evaluate(async (el: HTMLImageElement) => {
        await el.decode()
        return el.naturalWidth
      })
    ).toBe(1200)
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(960, 640)
    )
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      await page.locator('html[data-theme="' + colorScheme + '"]').waitFor()
      await previous.click()
      await dialog.getByText('2 of 2').waitFor()
      await next.click()
      await dialog.getByText('1 of 2').waitFor()
      const box = (await image.boundingBox())!
      const left = (await previous.boundingBox())!
      const right = (await next.boundingBox())!
      expect(left.x + left.width).toBeLessThan(box.x)
      expect(right.x).toBeGreaterThan(box.x + box.width)
      await page.screenshot({
        path: 'test-results/todo-image-preview/gallery-' + colorScheme + '.png'
      })
    }
    await page.keyboard.press('Escape')
    await opener.and(page.locator(':focus')).waitFor()
    expect(await title.inputValue()).toBe('Review both captures')
  },
  electronScenarioTimeoutMs
)
