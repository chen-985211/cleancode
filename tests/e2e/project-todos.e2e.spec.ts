// @vitest-environment node
import {
  closeElectronApp,
  createE2eWorkbench,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  selectBlankCanvasAction,
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
    'lets canvas gestures finish and keeps the viewport fixed throughout double-click dismissal',
    async () => {
      const workbench = await createE2eWorkbench('cleancode-todo-canvas')
      resources = { workbench }
      const app = await launchApp(workbench)
      resources.electronApp = app
      const page = await app.firstWindow()
      resources.page = page
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目', exact: true }).click()
      await selectBlankCanvasAction(page, '新建终端')
      const node = page.locator('.react-flow__node-terminal').first()
      const header = node.locator('.terminal-node__title strong')
      await header.waitFor()
      await page.getByRole('button', { name: '打开待办清单' }).click()
      await page.getByRole('button', { name: '记一条' }).click()
      const title = page.getByRole('textbox', { name: '待办内容' })
      await title.fill('核对终端操作')
      const pane = page.locator('.react-flow__pane')
      const paneBox = (await pane.boundingBox())!
      const blank = { x: paneBox.x + 20, y: paneBox.y + 64 }
      await page.mouse.move(blank.x, blank.y)
      await page.mouse.down()
      await page.mouse.move(blank.x + 24, blank.y + 10, { steps: 6 })
      await page.mouse.up()
      expect(await title.inputValue()).toBe('核对终端操作')
      await header.click({ trial: true })
      const box = (await header.boundingBox())!
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2
      const position = () => node.evaluate((el) => (el as HTMLElement).style.transform)
      const before = await position()
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 48, y + 32, { steps: 8 })
      await page.mouse.up()
      await expect.poll(position).not.toBe(before)
      await header.click()
      await page.locator('.react-flow__node-terminal.selected').waitFor()
      expect(await title.inputValue()).toBe('核对终端操作')
      expect(await title.evaluate((el) => el === document.activeElement)).toBe(false)
      const viewport = page.locator('.react-flow__viewport').first()
      const transform = () => viewport.evaluate((el) => getComputedStyle(el).transform)
      // Input activation happens after the title's camera transition settles.
      await node.locator('.xterm-helper-textarea:focus').waitFor({ state: 'attached' })
      const focused = await transform()
      expect(
        await viewport.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)
      ).not.toBe(0.5)
      await page.mouse.click(blank.x, blank.y)
      await page.locator('.react-flow__node-terminal.selected').waitFor({ state: 'detached' })
      expect(await title.inputValue()).toBe('核对终端操作')
      await pane.click({ button: 'right', position: { x: 20, y: 64 } })
      await page.getByRole('menuitem', { name: /新建终端/ }).waitFor()
      await page.mouse.click(blank.x + 4, blank.y - 8)
      await page.getByRole('menuitem', { name: /新建终端/ }).waitFor({ state: 'hidden' })
      expect(await page.locator('.todo-opener').getAttribute('aria-expanded')).toBe('true')
      expect(await transform()).toBe(focused)
      await page.mouse.move(blank.x, blank.y)
      await page.mouse.wheel(0, -120)
      await page.mouse.click(blank.x, blank.y)
      expect(await page.locator('.todo-opener').getAttribute('aria-expanded')).toBe('true')
      const interrupted = await transform()
      const trace = await viewport.evaluateHandle((el) => {
        const transforms = new Set<string>()
        const observer = new MutationObserver(() => transforms.add(getComputedStyle(el).transform))
        observer.observe(el, { attributes: true, attributeFilter: ['style'] })
        return { transforms, observer }
      })
      await page.mouse.dblclick(blank.x, blank.y)
      await page.locator('#project-todo-drawer').waitFor({ state: 'detached' })
      const firstUnexpectedTransform = await trace.evaluate(({ transforms, observer }, before) => {
        observer.disconnect()
        return [...transforms].find((transform) => transform !== before)
      }, interrupted)
      await trace.dispose()
      expect(firstUnexpectedTransform).toBeUndefined()
      expect(await transform()).toBe(interrupted)
      await page.mouse.click(blank.x, blank.y)
      await page.waitForFunction(() => {
        const el = document.querySelector('.react-flow__viewport')!
        return new DOMMatrixReadOnly(getComputedStyle(el).transform).a === 0.5
      })
    },
    electronScenarioTimeoutMs
  )

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
      const opener = page.locator('.todo-opener')
      const canvas = page.locator('.react-flow').first()
      await opener.waitFor({ timeout: 5000 })
      const anchor = await opener.boundingBox()
      const navigation = await page.locator('.canvas-minimap__navigation-row').boundingBox()
      expect(anchor!.height).toBe(navigation!.height)
      expect(anchor!.y).toBe(navigation!.y)
      const before = await canvas.boundingBox()
      await opener.click()
      const drawer = page.getByRole('complementary', { name: '待办清单' })
      await page.locator('.project-todo-drawer[data-surface-motion-state="open"]').waitFor()
      expect(await canvas.boundingBox()).toEqual(before)
      expect(await opener.boundingBox()).toEqual(anchor)
      const coveredControls = page.locator(
        '.app-shell__settings .toolbar-utility-button, .canvas-minimap__navigation-row button, .todo-opener'
      )
      for (const control of await coveredControls.all()) {
        expect(
          await control.evaluate((button) => {
            const { x, y, width, height } = button.getBoundingClientRect()
            return !!document
              .elementFromPoint(x + width / 2, y + height / 2)
              ?.closest('#project-todo-drawer')
          })
        ).toBe(true)
      }
      await drawer.getByRole('button', { name: '收起待办清单' }).click()
      await drawer.waitFor({ state: 'hidden' })
      await opener.click()
      await page.locator('.project-todo-drawer[data-surface-motion-state="open"]').waitFor()
      await canvas.click({ position: { x: before!.width / 4, y: before!.height / 2 } })
      await drawer.waitFor({ state: 'hidden' })
      await opener.click()
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
      const savedTitle = page.getByRole('button', { name: '调整筛选栏', exact: true })
      await savedTitle.waitFor()
      expect(await page.getByRole('link', { name: /example.org/ }).count()).toBe(0)
      expect(
        await page.locator('.todo-detail').evaluate((el) => el.getBoundingClientRect().height)
      ).toBe(0)
      await savedTitle.click()
      expect(await page.getByRole('link', { name: /example.org/ }).getAttribute('href')).toBe(
        'https://example.org/filter'
      )
      const img = page.getByRole('img', { name: '粘贴的截图' })
      await img.evaluate(async (node) => {
        await (node as HTMLImageElement).decode()
      })
      expect(await img.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(1)
      await page.mouse.move(8, 8)
      const pencil = page.getByRole('button', { name: '编辑“调整筛选栏”' })
      const pencilOpacity = () => pencil.evaluate((el) => getComputedStyle(el).opacity)
      await expect.poll(pencilOpacity).toBe('0')
      expect(
        await page.locator('.todo-expanded').evaluate((el) => getComputedStyle(el).boxShadow)
      ).not.toBe('none')
      const address = page.getByRole('link', { name: /example.org/ })
      await address.hover()
      await expect.poll(pencilOpacity).toBe('1')
      const clipBox = (await address.locator('svg').boundingBox())!
      const addressBox = (await address.locator('strong').boundingBox())!
      expect(clipBox.x + clipBox.width).toBeLessThanOrEqual(addressBox.x)
      expect(await address.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none')
      // Observe the actual click after React's delegated handler, before native navigation.
      await address.evaluate((link) => {
        document.addEventListener(
          'click',
          (event) => {
            link.setAttribute('data-navigation-prevented', String(event.defaultPrevented))
            event.preventDefault()
          },
          { once: true }
        )
      })
      await address.click()
      expect(await page.locator('.todo-link-row a').getAttribute('data-navigation-prevented')).toBe(
        'true'
      )
      await expect.poll(() => savedTitle.getAttribute('aria-expanded')).toBe('false')
      expect(await page.getByRole('textbox', { name: '待办内容' }).count()).toBe(0)
      await savedTitle.dblclick()
      expect(await savedTitle.getAttribute('aria-expanded')).toBe('false')
      expect(await page.getByRole('textbox', { name: '待办内容' }).count()).toBe(0)
      await savedTitle.click()
      await page.mouse.move(8, 8)
      await savedTitle.press('Tab')
      expect(await pencil.evaluate((el) => el === document.activeElement)).toBe(true)
      await expect.poll(pencilOpacity).toBe('1')
      const titleBox = (await savedTitle.boundingBox())!
      const pencilBox = (await pencil.boundingBox())!
      expect(pencilBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width)
      expect(
        Math.abs(pencilBox.y + pencilBox.height / 2 - titleBox.y - titleBox.height / 2)
      ).toBeLessThan(1)
      const expandedRow = page.locator('.todo-expanded')
      const settle = () =>
        expandedRow.evaluate(async (row) => {
          await Promise.allSettled(
            row.getAnimations({ subtree: true }).map((animation) => animation.finished)
          )
        })
      await settle()
      const sizes = await expandedRow.evaluateHandle((row) => {
        const elements = [
          row,
          ...row.querySelectorAll(
            '.todo-title-slot, .todo-note-slot, .todo-link-row a, .todo-thumbnail'
          )
        ]
        const initial = elements.map((el) => el.getBoundingClientRect())
        const changed = new Set<string>()
        const observer = new ResizeObserver(() => {
          elements.forEach((el, i) => {
            const bounds = el.getBoundingClientRect()
            if (bounds.width !== initial[i].width || bounds.height !== initial[i].height)
              changed.add(el.className)
          })
        })
        elements.forEach((el) => observer.observe(el))
        return { changed, observer }
      })
      await pencil.click()
      const editor = page.getByRole('textbox', { name: '待办内容' })
      expect(await editor.evaluate((el) => el === document.activeElement)).toBe(true)
      await settle()
      await editor.press('Escape')
      await settle()
      expect(
        await sizes.evaluate(({ changed, observer }) => {
          observer.disconnect()
          return [...changed]
        })
      ).toEqual([])
      await sizes.dispose()
      await savedTitle.press('F2')
      await editor.fill('调整筛选栏宽度')
      await editor.press('Escape')
      const renamed = page.getByRole('button', { name: '调整筛选栏宽度', exact: true })
      await renamed.press('Escape')
      expect(await renamed.getAttribute('aria-expanded')).toBe('false')
      expect(await page.getByRole('img', { name: '粘贴的截图' }).count()).toBe(0)
    },
    electronScenarioTimeoutMs
  )
})
