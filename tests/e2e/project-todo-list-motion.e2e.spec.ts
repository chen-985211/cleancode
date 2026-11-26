// @vitest-environment node
import { electronScenarioTimeoutMs } from '../support/e2eWorkbench'
import { startProjectTodoScenario } from '../support/projectTodoE2e'

it(
  'keeps in-flight entries continuous, shows status feedback at the source and resumes reading after canvas dismissal',
  async () => {
    const { page } = await startProjectTodoScenario()
    const open = page.locator('.todo-opener')
    await open.click()
    await page.getByRole('button', { name: '记一条' }).click()
    const title = page.getByRole('textbox', { name: '待办内容' })
    const drawer = page.locator('#project-todo-drawer')
    const settle = () =>
      drawer.evaluate(async (el) => {
        await Promise.allSettled(
          el.getAnimations({ subtree: true }).map((animation) => animation.finished)
        )
      })
    await title.fill('连续录入一')
    await settle()
    const held = await title.evaluateHandle(async (input) => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
      const list = document.querySelector('#project-todo-drawer')!
      const row = Array.from(list.querySelectorAll('.todo-title')).find(
        (el) => el.textContent === '连续录入一'
      )!
      const inFlight = list
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === 'running')
      for (const animation of inFlight) {
        animation.pause()
        animation.currentTime = Number(animation.effect!.getTiming().duration) * 0.3
      }
      return { row, inFlight }
    })
    await title.fill('连续录入二')
    const handoff = await held.evaluate(async ({ row, inFlight }) => {
      const input = document.activeElement
      if (!(input instanceof HTMLTextAreaElement))
        throw new Error('Expected an active capture editor')
      const before = row.getBoundingClientRect().top
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
      const after = row.getBoundingClientRect().top
      for (const animation of inFlight) if (animation.playState === 'paused') animation.play()
      return { before, after, count: inFlight.length }
    })
    await held.dispose()
    expect(handoff.count).toBeGreaterThan(0)
    expect(Math.abs(handoff.after - handoff.before)).toBeLessThan(1)
    await settle()
    expect(
      await page
        .getByRole('button', { name: '连续录入一', exact: true })
        .getAttribute('aria-expanded')
    ).toBe('false')
    for (let i = 0; i < 15; i++) {
      await title.fill('待复查 ' + i)
      await title.press('Enter')
    }
    await title.press('Escape')
    await settle()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const source = page.getByRole('button', { name: '待复查 14，当前待办，改为进行中' })
    const feedback = await source.evaluate(async (button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error('Expected the status button')
      const y = button.getBoundingClientRect().top
      const id = button.getAttribute('data-todo-status')
      button.click()
      await Promise.resolve()
      const changed = document.querySelector('[data-todo-status="' + id + '"]')!
      return {
        y,
        changedY: changed.getBoundingClientRect().top,
        label: changed.getAttribute('aria-label')
      }
    })
    expect(feedback.label).toContain('当前进行中')
    expect(Math.abs(feedback.y - feedback.changedY)).toBeLessThan(1)
    await settle()
    await page.getByRole('button', { name: '待复查 13', exact: true }).press('F2')
    await title.evaluate(async (field) => {
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = 300
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((image) => resolve(image!)))
      const clipboard = new DataTransfer()
      clipboard.items.add(new File([blob], 'canvas.png', { type: blob.type }))
      field.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true })
      )
    })
    await page
      .getByRole('img', { name: '粘贴的截图' })
      .evaluate((el) => (el as HTMLImageElement).decode())
    await title.press('Escape')
    const read = page.getByRole('button', { name: '待复查 1', exact: true })
    await read.click()
    await settle()
    expect(await drawer.locator('.todo-expanded').count()).toBe(1)
    expect(await title.inputValue()).toBe('待复查 1')
    expect(
      await page
        .getByRole('button', { name: '待复查 13', exact: true })
        .getAttribute('aria-expanded')
    ).toBe('false')
    expect(await drawer.locator('.todo-scroll').evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    const readingY = await title.evaluate((el) => el.getBoundingClientRect().top)
    await drawer.screenshot({ path: 'test-results/todo-inline-edit/switching-rows.png' })
    const pane = await page.locator('.react-flow__pane').boundingBox()
    await page.mouse.click(pane!.x + 20, pane!.y + 64)
    await drawer.waitFor({ state: 'detached' })
    await open.click()
    await drawer.locator('.todo-scroll').waitFor()
    expect(await read.getAttribute('aria-expanded')).toBe('true')
    expect(await read.evaluate((el) => el.getBoundingClientRect().top)).toBeCloseTo(readingY, 0)
  },
  electronScenarioTimeoutMs
)

it(
  'uses the full drawer and holds the same row still across status boundaries',
  async () => {
    const { page } = await startProjectTodoScenario()
    const open = page.getByRole('button', { name: '打开待办清单' })
    await open.waitFor()
    await page.evaluate(async () => {
      const api = window.cleancode!
      const [{ project }] = await api.listWorkbenches()
      const history = Array.from({ length: 22 }, (_, i) => '完成记录 ' + (i + 1))
      const drafts = ['3434', '4434', '1111', ...history].map((text, i) => ({
        id: crypto.randomUUID(),
        text,
        note: '',
        images: [],
        links: [],
        status: i < 3 ? ('todo' as const) : ('done' as const)
      }))
      await api.saveTodo({ projectId: project.id, drafts })
    })
    await page.reload()
    await open.click()
    const drawer = page.locator('#project-todo-drawer[data-surface-motion-state="open"]')
    await drawer.waitFor()
    const list = drawer.locator('.todo-scroll')
    const boundary = page.getByRole('button', { name: /^3434，当前/ })
    await boundary.waitFor()
    const size = await list.evaluate((el) => ({
      unused:
        el.closest('#project-todo-drawer')!.getBoundingClientRect().bottom -
        el.getBoundingClientRect().bottom,
      overflow: el.scrollHeight - el.clientHeight
    }))
    expect.soft(size.unused).toBeLessThanOrEqual(1)
    expect(size.overflow).toBeGreaterThan(0)
    const firstRow = list.locator('.todo-row').first()
    const rowSize = () =>
      firstRow.evaluate((el) => {
        const { width, height } = el.getBoundingClientRect()
        return { width, height }
      })
    const shownSize = await rowSize()
    await drawer.getByRole('button', { name: '隐藏已完成' }).click()
    expect(await list.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0)
    expect(await rowSize()).toEqual(shownSize)
    await drawer.getByRole('button', { name: '显示已完成' }).click()
    expect(await rowSize()).toEqual(shownSize)
    for (const state of ['进行中', '已完成']) {
      const result = await boundary.evaluate(async (button) => {
        const start = button.getBoundingClientRect().top
        const id = button.getAttribute('data-todo-status')
        ;(button as HTMLButtonElement).click()
        await Promise.resolve()
        const target = document.querySelector('[data-todo-status="' + id + '"]')!
        const row = target.closest('.todo-row')!
        const motions = row
          .getAnimations()
          .filter((motion) =>
            (motion.effect as KeyframeEffect).getKeyframes().some((frame) => 'translate' in frame)
          )
        await Promise.allSettled(motions.map((motion) => motion.finished))
        return {
          delta: target.getBoundingClientRect().top - start,
          moves: motions.length,
          label: target.getAttribute('aria-label')
        }
      })
      expect(result.label).toContain('当前' + state)
      expect.soft(result.moves).toBe(0)
      expect.soft(Math.abs(result.delta)).toBeLessThan(1)
    }
    // The first click moves 1111 behind 4434. A second click changes the
    // circle to done but leaves the destination at that very same slot.
    const interrupted = await page
      .getByRole('button', { name: /^1111，当前/ })
      .evaluate(async (button) => {
        const id = button.getAttribute('data-todo-status')
        const status = () =>
          document.querySelector<HTMLButtonElement>('[data-todo-status="' + id + '"]')!
        const travel = () =>
          status()
            .closest('.todo-row')!
            .getAnimations()
            .find((a) =>
              (a.effect as KeyframeEffect).getKeyframes().some((frame) => 'translate' in frame)
            )
        status().click()
        await Promise.resolve()
        const motion = travel()
        if (!motion) throw new Error('Expected the first status change to move the row')
        motion.pause()
        const timing = motion.effect!.getTiming()
        motion.currentTime = timing.delay! + Number(timing.duration) / 3
        const before = status().getBoundingClientRect().top
        status().click()
        await Promise.resolve()
        const after = status().getBoundingClientRect().top
        const continued = travel() === motion
        travel()?.finish()
        return { continued, delta: after - before, label: status().getAttribute('aria-label') }
      })
    expect(interrupted.label).toContain('当前已完成')
    expect.soft(interrupted.continued).toBe(true)
    expect.soft(Math.abs(interrupted.delta)).toBeLessThan(1)
    expect((await list.locator('.todo-title').allTextContents()).slice(0, 3)).toEqual([
      '4434',
      '1111',
      '3434'
    ])
    await list.hover()
    await page.mouse.wheel(0, await list.evaluate((el) => el.scrollHeight))
    await page.waitForFunction(() => {
      const el = document.querySelector('.todo-scroll')!
      return el.scrollHeight - el.clientHeight - el.scrollTop < 1
    })
    const last = await list.evaluate((el) => {
      const row = el.querySelectorAll('.todo-row')
      const bounds = row[row.length - 1].getBoundingClientRect()
      const viewport = el.getBoundingClientRect()
      return { top: bounds.top - viewport.top, bottom: viewport.bottom - bounds.bottom }
    })
    expect(last.top).toBeGreaterThanOrEqual(0)
    expect(last.bottom).toBeGreaterThanOrEqual(0)
    expect(last.bottom).toBeLessThanOrEqual(20)
  },
  electronScenarioTimeoutMs
)
