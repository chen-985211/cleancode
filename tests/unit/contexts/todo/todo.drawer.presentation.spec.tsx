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
    const group = await screen.findByRole('region', { name: '待办' })
    const refs = within(group)
    expect(refs.queryByRole('link')).toBeNull()
    expect(refs.queryByRole('img')).toBeNull()
    fireEvent.click(refs.getByRole('button', { name: item.text }))
    expect(refs.getByRole('link', { name: /example.org/ })).toHaveAttribute('href', link)
    expect(await refs.findByRole('img', { name: '粘贴的截图' })).toBeVisible()
    const heading = refs.getByRole('button', { name: item.text })
    const address = refs.getByRole('link', { name: /example.org/ })
    expect(fireEvent.click(address)).toBe(false)
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
    for (const { text } of items) fireEvent.click(await screen.findByRole('button', { name: text }))
    for (const { text } of items)
      expect(screen.getByRole('button', { name: text })).toHaveAttribute('aria-expanded', 'true')
  })

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
