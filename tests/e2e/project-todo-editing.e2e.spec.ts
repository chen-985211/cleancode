// @vitest-environment node
import { electronScenarioTimeoutMs } from '../support/e2eWorkbench'
import { captureTodoWithReferences, startProjectTodoScenario } from '../support/projectTodoE2e'

it(
  'animates opening and closing a saved row for both motion preferences',
  async () => {
    const { page } = await startProjectTodoScenario()
    await page.getByRole('button', { name: '打开待办清单' }).click()
    await page.getByRole('button', { name: '记一条' }).click()
    const editor = page.getByRole('textbox', { name: '待办内容' })
    await editor.fill('检查展开动效')
    await editor.press('Enter')
    await editor.press('Escape')
    const savedTitle = page.getByRole('button', { name: '检查展开动效', exact: true })
    for (const preference of ['reduce', 'no-preference'] as const) {
      await page.emulateMedia({ reducedMotion: preference })
      await page.waitForFunction(
        (value) => matchMedia('(prefers-reduced-motion: ' + value + ')').matches,
        preference
      )
      for (const opening of [true, false]) {
        if (!opening) await editor.press('Escape')
        const motion = await savedTitle.evaluate(async (button, open) => {
          const detail = document.getElementById(button.getAttribute('aria-controls')!)!
          const height = () => detail.getBoundingClientRect().height
          const start = height()
          if (!(button instanceof HTMLButtonElement)) throw new Error('Expected a to-do button')
          if (open) button.click()
          else button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          await new Promise(requestAnimationFrame)
          const reveal = detail
            .getAnimations()
            .find(
              (animation) =>
                animation instanceof CSSTransition &&
                animation.transitionProperty === 'grid-template-rows'
            )
          if (!reveal) throw new Error('Missing to-do disclosure transition')
          const duration = Number(reveal.effect!.getTiming().duration)
          reveal.pause()
          reveal.currentTime = duration / 2
          const middle = height()
          reveal.finish()
          return { start, middle, end: height(), duration }
        }, opening)
        expect(motion.duration).toBe(260)
        expect(motion.end > motion.start).toBe(opening)
        expect(motion.middle).toBeGreaterThan(Math.min(motion.start, motion.end))
        expect(motion.middle).toBeLessThan(Math.max(motion.start, motion.end))
      }
    }
  },
  electronScenarioTimeoutMs
)

it(
  'places the caret under the pointer and preserves attachment geometry while editing',
  async () => {
    const { page } = await startProjectTodoScenario()
    await captureTodoWithReferences(page)
    const savedTitle = page.getByRole('button', { name: '调整筛选栏', exact: true })
    await savedTitle.press('Escape')
    await savedTitle.evaluate(async (button) => {
      const row = button.closest('.todo-row')!
      await Promise.allSettled(
        row.getAnimations({ subtree: true }).map((animation) => animation.finished)
      )
    })
    const editor = page.getByRole('textbox', { name: '待办内容' })
    const point = await savedTitle.locator('.todo-caption').evaluate((caption) => {
      const range = document.createRange()
      range.setStart(caption.firstChild!, 2)
      range.collapse(true)
      const box = range.getBoundingClientRect()
      return { x: box.x, y: box.y + box.height / 2, cursor: getComputedStyle(caption).cursor }
    })
    await page.mouse.click(point.x, point.y)
    expect.soft(point.cursor).toBe('text')
    expect(await editor.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(2)
    await page.mouse.move(8, 8)
    expect(await editor.evaluate((el) => el === document.activeElement)).toBe(true)
    expect(
      await page.locator('.todo-expanded').evaluate((el) => getComputedStyle(el).boxShadow)
    ).not.toBe('none')
    const address = page.getByRole('link', { name: /example.org/ })
    await page.getByRole('textbox', { name: '备注' }).click()
    await editor.dblclick()
    expect(await editor.evaluate((el) => el === document.activeElement)).toBe(true)
    await editor.press('Escape')
    expect(await savedTitle.getAttribute('aria-expanded')).toBe('true')
    expect(await savedTitle.evaluate((el) => el === document.activeElement)).toBe(true)
    await savedTitle.press('Tab')
    const thumbnail = page.getByRole('button', { name: '放大查看截图' })
    expect(await thumbnail.evaluate((el) => el === document.activeElement)).toBe(true)
    await thumbnail.press('Tab')
    expect(await address.evaluate((el) => el === document.activeElement)).toBe(true)
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
    await savedTitle.click()
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
