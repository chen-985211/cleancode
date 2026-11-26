// @vitest-environment node
import { pollUntilState } from '../support/e2ePolling'
import { electronScenarioTimeoutMs, selectBlankCanvasAction } from '../support/e2eWorkbench'
import { setElectronContentSize } from '../support/e2eWindow'
import { startProjectTodoScenario } from '../support/projectTodoE2e'
import { waitForCreatedWorkbenchNodeResult } from '../support/workbenchNodeCreationE2e'

it(
  'keeps the canvas in place and restores covered controls when the drawer closes',
  async () => {
    const { page } = await startProjectTodoScenario()
    const opener = page.locator('.todo-opener')
    const canvas = page.locator('.react-flow').first()
    await opener.waitFor({ timeout: 5000 })
    const anchor = await opener.boundingBox()
    const navigation = await page.locator('.canvas-minimap__navigation-row').boundingBox()
    expect(anchor!.height).toBe(navigation!.height)
    expect(anchor!.y).toBe(navigation!.y)
    const before = await canvas.boundingBox()
    const openingEdge = await page
      .getByRole('button', { name: '打开待办清单' })
      .evaluate((opener: HTMLButtonElement) => {
        opener.click()
        return new Promise<number>((resolve) =>
          requestAnimationFrame(() => {
            const panel = document.getElementById('project-todo-drawer')!
            resolve(
              panel.closest('[data-workbench-canvas-obstruction]')!.getBoundingClientRect().left
            )
          })
        )
      })
    const drawer = page.getByRole('complementary', { name: '待办清单' })
    await page.locator('#project-todo-drawer[data-surface-motion-state="open"]').waitFor()
    expect(openingEdge).toBeCloseTo((await drawer.boundingBox())!.x, 0)
    const close = drawer.getByRole('button', { name: '收起待办清单' })
    await close.press('Shift+Tab')
    expect
      .soft(
        await drawer.evaluate((el) => {
          const active = document.activeElement
          if (!active || el.contains(active)) return false
          const a = active.getBoundingClientRect(),
            b = el.getBoundingClientRect()
          return a.width > 0 && a.left >= b.left && a.right <= b.right
        })
      )
      .toBe(false)
    const coveredChrome = await drawer.evaluate((el) => {
      const bounds = el.getBoundingClientRect()
      return [
        ...document.querySelectorAll<HTMLButtonElement>(
          '.canvas-minimap button, .app-shell__toolbar button, .app-shell__settings button'
        )
      ]
        .filter((button) => {
          const box = button.getBoundingClientRect()
          if (
            button.disabled ||
            box.width === 0 ||
            box.left < bounds.left ||
            box.right > bounds.right
          )
            return false
          button.focus({ preventScroll: true })
          return document.activeElement === button
        })
        .map((button) => button.getAttribute('aria-label') || button.textContent)
    })
    expect.soft(coveredChrome).toEqual([])
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
    await close.click()
    const zoom = page.getByRole('button', { name: '放大画布' })
    await zoom.focus()
    expect(await zoom.evaluate((button) => button === document.activeElement)).toBe(true)
    await drawer.waitFor({ state: 'hidden' })
    await opener.click()
    await page.locator('.project-todo-drawer[data-surface-motion-state="open"]').waitFor()
    await canvas.click({ position: { x: before!.width / 4, y: before!.height / 2 } })
    await drawer.waitFor({ state: 'hidden' })
  },
  electronScenarioTimeoutMs
)

it(
  'keeps a new terminal inside the exposed canvas at maximum drawer width in a narrow window',
  async () => {
    const { app, page } = await startProjectTodoScenario()
    await setElectronContentSize(app, { width: 1008, height: 681 })
    await page.getByRole('button', { name: '打开待办清单' }).click()
    const drawer = page.locator('#project-todo-drawer[data-surface-motion-state="open"]')
    await drawer.waitFor()
    const handle = drawer.getByRole('separator')
    const maxWidth = Number(await handle.getAttribute('aria-valuemax'))
    await handle.press('ArrowRight')
    expect((await drawer.boundingBox())!.width).toBeLessThan(maxWidth)
    const grip = (await handle.boundingBox())!
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(1, grip.y + grip.height / 2)
    await page.mouse.up()
    expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(maxWidth)
    expect((await drawer.boundingBox())!.width).toBe(maxWidth)
    await handle.press('ArrowRight')
    expect.soft((await drawer.boundingBox())!.width).toBeCloseTo(maxWidth - 16, 0)
    await handle.press('ArrowLeft')
    expect((await drawer.boundingBox())!.width).toBe(maxWidth)
    const pane = page.locator('.react-flow__pane')
    await pane.click({ button: 'right', position: { x: 40, y: 150 } })
    await page.getByRole('menuitem', { name: /新建终端/ }).click()
    const selector = '.react-flow__node-terminal'
    await waitForCreatedWorkbenchNodeResult(page, selector)
    const node = (await page.locator(selector).boundingBox())!
    expect(node.x + node.width).toBeLessThanOrEqual((await drawer.boundingBox())!.x - 23)
    await page.screenshot({ path: 'test-results/project-todo-exposed-canvas.png' })
    const nodeControl = page.locator(selector).getByRole('button', { name: /折叠终端/ })
    expect(
      await nodeControl.evaluate((button) => {
        button.focus({ preventScroll: true })
        return button === document.activeElement
      })
    ).toBe(true)
  },
  electronScenarioTimeoutMs
)

it(
  'lets canvas gestures finish and keeps the viewport fixed throughout double-click dismissal',
  async () => {
    const { page } = await startProjectTodoScenario()
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
    await pollUntilState({
      description: 'the dragged terminal to move away from its starting position',
      observe: position,
      accept: (current) => current !== before,
      timeoutMs: 5000
    })
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
