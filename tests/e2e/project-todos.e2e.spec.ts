// @vitest-environment node
import { pollUntilState } from '../support/e2ePolling'
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

  it(
    'keeps in-flight entries continuous, shows status feedback at the source and resumes reading after canvas dismissal',
    async () => {
      const workbench = await createE2eWorkbench('cleancode-todo-interruption')
      resources = { workbench }
      const app = await launchApp(workbench)
      resources.electronApp = app
      const page = await app.firstWindow()
      resources.page = page
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目', exact: true }).click()
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
      const offset = () => drawer.locator('.todo-scroll').evaluate((el) => el.scrollTop)
      const before = await offset()
      expect(before).toBeGreaterThan(0)
      const readingY = await read.evaluate((el) => el.getBoundingClientRect().top)
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
      const workbench = await createE2eWorkbench('cleancode-todo-viewport')
      resources = { workbench }
      const app = await launchApp(workbench)
      resources.electronApp = app
      const page = await app.firstWindow()
      resources.page = page
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目', exact: true }).click()
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
      await list.evaluate((el) => {
        el.scrollTop = el.scrollHeight
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
      for (const preference of ['reduce', 'no-preference'] as const) {
        await page.emulateMedia({ reducedMotion: preference })
        await page.waitForFunction(
          (value) => matchMedia('(prefers-reduced-motion: ' + value + ')').matches,
          preference
        )
        for (const opening of [true, false]) {
          const motion = await savedTitle.evaluate(async (button) => {
            const detail = document.getElementById(button.getAttribute('aria-controls')!)!
            const height = () => detail.getBoundingClientRect().height
            const start = height()
            if (!(button instanceof HTMLButtonElement)) throw new Error('Expected a to-do button')
            button.click()
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
          })
          expect(motion.duration).toBe(260)
          expect(motion.end > motion.start).toBe(opening)
          expect(motion.middle).toBeGreaterThan(Math.min(motion.start, motion.end))
          expect(motion.middle).toBeLessThan(Math.max(motion.start, motion.end))
        }
      }
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
      const waitForPencilOpacity = (opacity: string) =>
        pollUntilState({
          description: 'the edit pencil to reach opacity ' + opacity,
          observe: () => pencil.evaluate((el) => getComputedStyle(el).opacity),
          accept: (current) => current === opacity,
          timeoutMs: 5000
        })
      await waitForPencilOpacity('0')
      expect(
        await page.locator('.todo-expanded').evaluate((el) => getComputedStyle(el).boxShadow)
      ).not.toBe('none')
      const address = page.getByRole('link', { name: /example.org/ })
      await address.hover()
      await waitForPencilOpacity('1')
      const clipBox = (await address.locator('svg').boundingBox())!
      const addressBox = (await address.locator('strong').boundingBox())!
      expect(clipBox.x + clipBox.width).toBeLessThanOrEqual(addressBox.x)
      expect(await address.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none')
      const opened = await resources.electronApp!.evaluateHandle(({ shell }) => {
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
      await address.locator('strong').click()
      expect(await waitForOpenedUrls(1)).toEqual(['https://example.org/filter'])
      expect(await savedTitle.getAttribute('aria-expanded')).toBe('true')
      await address.press('Enter')
      expect(await waitForOpenedUrls(2)).toEqual([
        'https://example.org/filter',
        'https://example.org/filter'
      ])
      await opened.dispose()
      const linkRow = page.locator('.todo-link-row')
      const rowBox = (await linkRow.boundingBox())!
      await linkRow.click({ position: { x: rowBox.width - 2, y: rowBox.height / 2 } })
      await savedTitle.and(page.locator('[aria-expanded="false"]')).waitFor()
      expect(await page.getByRole('textbox', { name: '待办内容' }).count()).toBe(0)
      await savedTitle.dblclick()
      expect(await savedTitle.getAttribute('aria-expanded')).toBe('false')
      expect(await page.getByRole('textbox', { name: '待办内容' }).count()).toBe(0)
      await savedTitle.click()
      await page.mouse.move(8, 8)
      await savedTitle.press('Tab')
      expect(await pencil.evaluate((el) => el === document.activeElement)).toBe(true)
      await waitForPencilOpacity('1')
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
