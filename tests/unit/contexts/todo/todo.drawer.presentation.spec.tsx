import { fireEvent, render, screen, within } from '@testing-library/react'
import { blankTodo } from '../../../../src/contexts/todo/presentation/TodoSession'
import { ProjectTodoDrawer } from '../../../../src/contexts/todo/presentation/ProjectTodoDrawer'

describe('project to-do drawer', () => {
  it('keeps the drawer open when the canvas receives a pointer or keyboard focus', async () => {
    const api = { listTodos: vi.fn(async () => []), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    const onCanvasPointer = vi.fn()
    render(
      <>
        <button onPointerDown={onCanvasPointer}>Canvas</button>
        <ProjectTodoDrawer projectId="project" api={api} />
      </>
    )
    const opener = screen.getByRole('button', { name: '打开待办清单' })
    fireEvent.click(opener)
    const drawer = await screen.findByRole('complementary', { name: '待办清单' })
    const arrow = within(drawer).getByRole('button', { name: '收起待办清单' })
    expect(arrow).toHaveFocus()
    fireEvent.pointerDown(drawer)
    expect(opener).toHaveAttribute('aria-expanded', 'true')
    const canvas = screen.getByText('Canvas')
    fireEvent.pointerDown(canvas)
    canvas.focus()
    expect(canvas).toHaveFocus()
    expect(opener).toHaveAttribute('aria-expanded', 'true')
    expect(onCanvasPointer).toHaveBeenCalledOnce()
    fireEvent.click(
      within(screen.getByRole('complementary')).getByRole('button', { name: '收起待办清单' })
    )
    expect(opener).toHaveAttribute('aria-expanded', 'false')
    expect(opener).toHaveFocus()
  })

  it('keeps deletion out of the typing surface and offers it from the item context menu', async () => {
    const item = { ...blankTodo(), text: '111111', createdAt: 1, completedAt: null }
    const api = { listTodos: vi.fn(async () => [item]), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    const opener = screen.getByRole('button', { name: '打开待办清单' })
    fireEvent.click(opener)
    fireEvent.click(await screen.findByRole('button', { name: '编辑“111111”' }))
    expect(screen.queryByRole('button', { name: '删除此条' })).toBeNull()
    const title = screen.getByRole('textbox', { name: '待办内容' })
    expect(title).toHaveFocus()
    fireEvent.keyDown(title, { key: 'Escape' })
    const collapsedTitle = screen.getByRole('button', { name: item.text })
    expect(collapsedTitle).toHaveFocus()
    fireEvent.contextMenu(collapsedTitle)
    fireEvent.click(await screen.findByRole('menuitem', { name: '删除此条' }))
    expect(screen.queryByRole('button', { name: item.text })).toBeNull()
    expect(opener).toHaveTextContent('00/00')
  })

  it.each(['待办内容', '备注'])(
    'deletes the edited item from the %s context menu',
    async (field) => {
      const items = ['保留', '移除'].map((text) => ({
        ...blankTodo(),
        text,
        createdAt: 1,
        completedAt: null
      }))
      const api = { listTodos: vi.fn(async () => items), saveTodo: vi.fn(), readTodoImage: vi.fn() }
      render(<ProjectTodoDrawer projectId="project" api={api} />)
      const opener = screen.getByRole('button', { name: '打开待办清单' })
      fireEvent.click(opener)
      fireEvent.click(await screen.findByRole('button', { name: '编辑“移除”' }))
      fireEvent.contextMenu(screen.getByRole('textbox', { name: field }))
      fireEvent.click(await screen.findByRole('menuitem', { name: '删除此条' }))
      expect(screen.queryByRole('button', { name: '移除' })).toBeNull()
      expect(screen.getByRole('button', { name: '保留' })).toBeVisible()
      expect(opener).toHaveTextContent('00/01')
    }
  )

  it('shows an empty note when a title-only item is expanded without editing it', async () => {
    const item = { ...blankTodo(), text: '改进筛选栏', createdAt: 1, completedAt: null }
    const api = { listTodos: vi.fn(async () => [item]), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    fireEvent.click(screen.getByRole('button', { name: '打开待办清单' }))
    const heading = await screen.findByRole('button', { name: item.text })
    fireEvent.click(heading)
    const note = screen.getByRole('paragraph')
    expect(note).toHaveTextContent('填写备注，或粘贴链接、图片')
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(note)
    expect(heading).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('paragraph')).toBeNull()
    expect(api.saveTodo).not.toHaveBeenCalled()
  })

  it('reveals notes, links and images together only while their item is expanded', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private onEntries: (entries: { isIntersecting: boolean }[]) => void) {}
        observe() {
          this.onEntries([{ isIntersecting: true }])
        }
        disconnect() {}
      }
    )
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })
    const link = 'https://example.org/design/filter'
    const item = {
      ...blankTodo(),
      text: '改进筛选栏',
      links: [link],
      images: [crypto.randomUUID()],
      createdAt: 1,
      completedAt: null
    }
    const api = {
      listTodos: vi.fn(async () => [item]),
      saveTodo: vi.fn(),
      readTodoImage: vi.fn(async () => 'data:image/png;base64,AAAA')
    }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    const opener = screen.getByRole('button', { name: '打开待办清单' })
    fireEvent.click(opener)
    const refs = within(await screen.findByRole('complementary', { name: '待办清单' }))
    expect(refs.queryByRole('link')).toBeNull()
    expect(refs.queryByRole('img')).toBeNull()
    fireEvent.click(refs.getByRole('button', { name: item.text }))
    expect(refs.getByRole('link', { name: /example.org/ })).toHaveAttribute('href', link)
    expect(await refs.findByRole('img', { name: '粘贴的截图' })).toBeVisible()
    const heading = refs.getByRole('button', { name: item.text })
    const address = refs.getByRole('link', { name: /example.org/ })
    const before = (first: Element, second: Element) =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(refs.getByRole('img'), address)).toBe(true)
    expect(before(address, refs.getByRole('paragraph'))).toBe(true)
    expect(address.firstElementChild?.tagName).toBe('svg')
    expect(refs.getByRole('paragraph')).toHaveTextContent('填写备注，或粘贴链接、图片')
    expect(fireEvent.click(address)).toBe(true)
    expect(heading).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(refs.getByRole('paragraph'))
    expect(heading).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(heading)
    expect(heading).toHaveAttribute('aria-expanded', 'true')
    expect(refs.queryByRole('textbox')).toBeNull()
    expect(refs.queryByRole('button', { name: '移除链接' })).toBeNull()
    expect(refs.getByRole('link').querySelectorAll('svg')).toHaveLength(1)
    fireEvent.click(heading)
    expect(heading).toHaveAttribute('aria-expanded', 'false')
    for (const detail of [1, 2, 3]) {
      fireEvent.click(heading, { detail })
      expect(heading).toHaveAttribute('aria-expanded', String(detail % 2 === 1))
    }
    fireEvent.doubleClick(heading)
    expect(refs.queryByRole('textbox')).toBeNull()
    fireEvent.click(refs.getByRole('button', { name: '编辑“改进筛选栏”' }))
    expect(refs.getByRole('textbox', { name: '待办内容' })).toHaveFocus()
    const noteEditor = refs.getByRole('textbox', { name: '备注' })
    expect(noteEditor).toHaveAttribute('placeholder', '填写备注，或粘贴链接、图片')
    expect(before(refs.getByRole('link'), noteEditor)).toBe(true)
    expect(refs.getByRole('button', { name: '移除链接' })).toBeVisible()
    fireEvent.keyDown(refs.getByRole('textbox', { name: '待办内容' }), { key: 'Escape' })
    fireEvent.keyDown(refs.getByRole('button', { name: item.text }), { key: 'Escape' })
    expect(refs.queryByRole('link')).toBeNull()
    expect(refs.queryByRole('img')).toBeNull()
    expect(opener).toHaveTextContent('00/01')
    expect(api.saveTodo).not.toHaveBeenCalled()
  })

  it('keeps previously opened items visible when another item is opened', async () => {
    const items = ['第一条', '第二条'].map((text) => ({
      ...blankTodo(),
      text,
      note: text + '备注',
      createdAt: 1,
      completedAt: null
    }))
    const api = { listTodos: vi.fn(async () => items), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    fireEvent.click(screen.getByRole('button', { name: '打开待办清单' }))
    const add = await screen.findByRole('button', { name: '记一条' })
    const first = await screen.findByRole('button', { name: items[0].text })
    expect(add.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(add)
    expect(screen.queryByRole('button', { name: '记一条' })).toBeNull()
    fireEvent.keyDown(screen.getByRole('textbox', { name: '待办内容' }), { key: 'Escape' })
    expect(screen.getByRole('button', { name: '记一条' })).toHaveFocus()
    for (const { text } of items) fireEvent.click(await screen.findByRole('button', { name: text }))
    for (const { text } of items)
      expect(screen.getByRole('button', { name: text })).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps newly captured items first after autosave, Enter and leaving the editor', async () => {
    const older = { ...blankTodo(), text: '已有待办', createdAt: 1, completedAt: null }
    const api = { listTodos: vi.fn(async () => [older]), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    fireEvent.click(screen.getByRole('button', { name: '打开待办清单' }))
    fireEvent.click(await screen.findByRole('button', { name: '记一条' }))
    const editor = () => screen.getByRole('textbox', { name: '待办内容' })
    fireEvent.change(editor(), { target: { value: '先记的' } })
    expect(screen.queryByRole('button', { name: '记一条' })).toBeNull()
    fireEvent.keyDown(editor(), { key: 'Enter' })
    expect(editor()).toHaveFocus()
    expect(screen.getByRole('button', { name: '先记的' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: '记一条' })).toBeNull()
    fireEvent.change(editor(), { target: { value: '后记的' } })
    fireEvent.keyDown(editor(), { key: 'Escape' })
    await screen.findByRole('button', { name: '后记的' })
    const titles = screen
      .getAllByRole('button', { name: /^(已有待办|先记的|后记的)$/ })
      .map((button) => button.textContent)
    expect(titles).toEqual(['后记的', '先记的', '已有待办'])
  })

  it('keeps a saved item in place through an empty edit and finishes Enter on its own title', async () => {
    const items = ['较旧', '较新'].map((text) => ({
      ...blankTodo(),
      text,
      createdAt: 1,
      completedAt: null
    }))
    const api = { listTodos: vi.fn(async () => items), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    const opener = screen.getByRole('button', { name: '打开待办清单' })
    fireEvent.click(opener)
    fireEvent.click(await screen.findByRole('button', { name: '编辑“较旧”' }))
    const title = screen.getByRole('textbox', { name: '待办内容' })
    fireEvent.change(title, { target: { value: '' } })
    expect(title).toHaveValue('')
    expect(opener).toHaveTextContent('00/02')
    expect(api.saveTodo).not.toHaveBeenCalled()
    fireEvent.change(title, { target: { value: '新标题' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    const renamed = screen.getByRole('button', { name: '新标题' })
    expect(renamed).toHaveFocus()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(
      screen.getByRole('button', { name: '较新' }).compareDocumentPosition(renamed) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    fireEvent.keyDown(renamed, { key: 'F2' })
    const editing = screen.getByRole('textbox', { name: '待办内容' })
    fireEvent.change(editing, { target: { value: '' } })
    fireEvent.keyDown(editing, { key: 'Escape' })
    expect(renamed).toHaveFocus()
    expect(opener).toHaveTextContent('00/02')
  })

  it('restores each project’s reading position and manually expanded items', async () => {
    const item = { ...blankTodo(), text: '阅读位置', createdAt: 1, completedAt: null }
    const api = { listTodos: vi.fn(async () => [item]), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    const view = render(<ProjectTodoDrawer projectId="first" api={api} />)
    fireEvent.click(screen.getByRole('button', { name: '打开待办清单' }))
    fireEvent.click(await screen.findByRole('button', { name: item.text }))
    const scroller = () => view.container.querySelector<HTMLElement>('.todo-scroll')!
    scroller().scrollTop = 84
    fireEvent.scroll(scroller())
    view.rerender(<ProjectTodoDrawer projectId="second" api={api} />)
    expect(await screen.findByRole('button', { name: item.text })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(scroller().scrollTop).toBe(0)
    view.rerender(<ProjectTodoDrawer projectId="first" api={api} />)
    expect(await screen.findByRole('button', { name: item.text })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(scroller().scrollTop).toBe(84)
  })

  it.each(['new', 'existing'] as const)(
    'leaves Shift+Enter to the title textarea and confirms the multiline %s item with Enter',
    async (mode) => {
      const item = { ...blankTodo(), text: '甲乙', createdAt: 1, completedAt: null }
      const api = {
        listTodos: vi.fn(async () => (mode === 'existing' ? [item] : [])),
        saveTodo: vi.fn(),
        readTodoImage: vi.fn()
      }
      render(<ProjectTodoDrawer projectId="project" api={api} />)
      const opener = screen.getByRole('button', { name: '打开待办清单' })
      fireEvent.click(opener)
      fireEvent.click(
        await screen.findByRole('button', { name: mode === 'new' ? '记一条' : '编辑“甲乙”' })
      )
      const title = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '待办内容' })
      if (mode === 'new') fireEvent.change(title, { target: { value: item.text } })
      title.setSelectionRange(1, 1)
      expect(fireEvent.keyDown(title, { key: 'Enter', shiftKey: true })).toBe(true)
      expect(title).toHaveFocus()
      expect(title).toHaveValue('甲乙')
      fireEvent.change(title, { target: { value: '甲\n乙' } })
      expect(api.saveTodo).toHaveBeenLastCalledWith(
        expect.objectContaining({ draft: expect.objectContaining({ text: '甲\n乙', note: '' }) })
      )
      fireEvent.keyDown(title, { key: 'Enter' })
      expect(screen.getByRole('button', { name: /^甲\s+乙$/ })).toBeVisible()
      expect(opener).toHaveTextContent('00/01')
      if (mode === 'new') expect(title).toHaveValue('')
      else expect(screen.queryByRole('textbox', { name: '待办内容' })).toBeNull()
    }
  )

  it('preserves title line breaks when pasting a reference at the caret', async () => {
    const item = { ...blankTodo(), text: '甲\n乙', note: '备注', createdAt: 1, completedAt: null }
    const api = { listTodos: vi.fn(async () => [item]), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    fireEvent.click(screen.getByRole('button', { name: '打开待办清单' }))
    fireEvent.click(await screen.findByRole('button', { name: /^编辑“甲\s+乙”$/ }))
    const title = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '待办内容' })
    title.setSelectionRange(2, 2)
    const reference = '参考 https://example.org/\r\n补充'
    fireEvent.paste(title, {
      clipboardData: {
        files: [],
        getData: (format: string) => (format === 'text/plain' ? reference : '')
      }
    })
    const text = '甲\n参考 https://example.org/\n补充乙'
    expect(title).toHaveValue(text)
    expect(api.saveTodo).toHaveBeenLastCalledWith(
      expect.objectContaining({ draft: expect.objectContaining({ text, note: item.note }) })
    )
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('备注')
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org/')
  })

  it.each(['todo', 'active', 'done'] as const)(
    'offers only deletion for a %s item',
    async (status) => {
      const item = {
        ...blankTodo(),
        status,
        text: '检查按钮',
        createdAt: 1,
        completedAt: status === 'done' ? 2 : null
      }
      const api = {
        listTodos: vi.fn(async () => [item]),
        saveTodo: vi.fn(),
        readTodoImage: vi.fn()
      }
      render(<ProjectTodoDrawer projectId="project" api={api} />)
      fireEvent.click(screen.getByRole('button', { name: '打开待办清单' }))
      fireEvent.contextMenu(await screen.findByRole('button', { name: item.text }))
      const actions = await screen.findAllByRole('menuitem')
      expect(actions.map((action) => action.textContent)).toEqual(['删除此条'])
      expect(api.saveTodo).not.toHaveBeenCalled()
    }
  )

  it('puts a changed item first in its destination and preserves the order of its peers', async () => {
    const items = ['甲', '乙', '丙', '丁'].map((text) => ({
      ...blankTodo(),
      text,
      createdAt: 1,
      completedAt: null
    }))
    const api = { listTodos: vi.fn(async () => items), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    fireEvent.click(screen.getByRole('button', { name: '打开待办清单' }))
    await screen.findByRole('button', { name: '甲' })
    const advance = (name: string) =>
      fireEvent.click(screen.getByRole('button', { name: new RegExp('^' + name + '，当前') }))
    const titles = () =>
      screen.getAllByRole('button', { name: /^[甲乙丙丁]$/ }).map((button) => button.textContent)
    advance('乙')
    advance('丁')
    expect(titles()).toEqual(['丙', '甲', '丁', '乙'])
    advance('丙')
    advance('丙')
    advance('乙')
    expect(titles()).toEqual(['甲', '丁', '乙', '丙'])
    advance('丁')
    expect(titles()).toEqual(['甲', '丁', '乙', '丙'])
    advance('丙')
    advance('乙')
    expect(titles()).toEqual(['乙', '丙', '甲', '丁'])
  })

  it('keeps the details of a solitary item open while its circle cycles in place', async () => {
    const item = {
      ...blankTodo(),
      text: '唯一一条',
      note: '继续阅读',
      images: [crypto.randomUUID()],
      createdAt: 1,
      completedAt: null
    }
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private callback: IntersectionObserverCallback) {}
        observe() {
          this.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          )
        }
        disconnect() {}
      }
    )
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })
    const api = {
      listTodos: vi.fn(async () => [item]),
      saveTodo: vi.fn(),
      readTodoImage: vi.fn(async () => 'data:image/png;base64,Zm9v')
    }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    fireEvent.click(screen.getByRole('button', { name: '打开待办清单' }))
    fireEvent.click(await screen.findByRole('button', { name: item.text }))
    const preview = await screen.findByRole('img', { name: '粘贴的截图' })
    for (const state of ['进行中', '已完成', '待办']) {
      fireEvent.click(screen.getByRole('button', { name: /^唯一一条，当前/ }))
      expect(screen.getByRole('region', { name: state })).toHaveAttribute(
        'aria-owns',
        'todo-entry-' + item.id
      )
      expect(screen.getByRole('button', { name: item.text })).toHaveAttribute(
        'aria-expanded',
        'true'
      )
      expect(screen.getByRole('paragraph')).toHaveTextContent(item.note)
      expect(preview).toBeInTheDocument()
    }
  })

  it.each([true, false])(
    'offers an optional split on a fresh numbered paste (split=%s)',
    async (split) => {
      const api = { listTodos: vi.fn(async () => []), saveTodo: vi.fn(), readTodoImage: vi.fn() }
      render(<ProjectTodoDrawer projectId="project" api={api} />)
      const opener = screen.getByRole('button', { name: '打开待办清单' })
      fireEvent.click(opener)
      fireEvent.click(await screen.findByRole('button', { name: '记一条' }))
      const title = screen.getByRole('textbox', { name: '待办内容' })
      const text = '1. 调整搜索框\n2. https://example.org/filter\n3. 优化空状态'
      fireEvent.paste(title, {
        clipboardData: {
          files: [],
          getData: (format: string) => (format === 'text/plain' ? text : '')
        }
      })
      const offer = screen.getByRole('button', { name: '拆成 3 条' })
      if (split) {
        fireEvent.click(offer)
        expect(
          screen
            .getAllByRole('button', { name: /^(调整搜索框|example\.org|优化空状态)$/ })
            .map((el) => el.textContent)
        ).toEqual(['调整搜索框', 'example.org', '优化空状态'])
        expect(opener).toHaveTextContent('00/03')
        fireEvent.click(screen.getByRole('button', { name: 'example.org' }))
        expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org/filter')
      } else {
        fireEvent.keyDown(title, { key: 'Escape' })
        expect(screen.getByRole('button', { name: '1. 调整搜索框' })).toBeVisible()
        expect(screen.getByRole('paragraph')).toHaveTextContent('2. https://example.org/filter')
        expect(opener).toHaveTextContent('00/01')
      }
    }
  )

  it('gives an image-only item a title without reading the screenshot until expansion', async () => {
    const item = { ...blankTodo(), images: [crypto.randomUUID()], createdAt: 1, completedAt: null }
    const api = { listTodos: vi.fn(async () => [item]), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    fireEvent.click(screen.getByRole('button', { name: '打开待办清单' }))
    expect(await screen.findByRole('button', { name: '粘贴的截图' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.queryByRole('img')).toBeNull()
    expect(api.readTodoImage).not.toHaveBeenCalled()
  })

  it('keeps a URL pasted into an empty title as an editable link-only to-do', async () => {
    const api = { listTodos: vi.fn(async () => []), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    const opener = screen.getByRole('button', { name: '打开待办清单' })
    fireEvent.click(opener)
    fireEvent.click(await screen.findByRole('button', { name: '记一条' }))
    const title = screen.getByRole('textbox', { name: '待办内容' })
    fireEvent.paste(title, {
      clipboardData: {
        files: [],
        getData: (format: string) => (format === 'text/plain' ? 'https://example.org/design' : '')
      }
    })
    expect(title).toHaveValue('')
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org/design')
    fireEvent.keyDown(title, { key: 'Escape' })
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org/design')
    expect(opener).toHaveTextContent('00/01')
    fireEvent.keyDown(screen.getByRole('button', { name: 'example.org' }), { key: 'F2' })
    expect(screen.getByRole('textbox', { name: '待办内容' })).toHaveFocus()
  })

  it('keeps the open control before the drawer in tab order and closes it with Escape', async () => {
    const api = { listTodos: vi.fn(async () => []), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    const button = screen.getByRole('button', { name: '打开待办清单' })
    button.focus()
    fireEvent.click(button)
    const add = await screen.findByRole('button', { name: '记一条' })
    expect(button.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.keyDown(
      within(screen.getByRole('complementary')).getByRole('button', { name: '收起待办清单' }),
      { key: 'Escape' }
    )
    expect(screen.queryByRole('complementary', { name: '待办清单' })).toBeNull()
    expect(button).toHaveFocus()
  })
})
