import { blankTodo, TodoSession } from '../../../../src/contexts/todo/presentation/TodoSession'
import type { TodoApi } from '../../../../src/contexts/todo/application/ProjectTodos'
import { todosInStatus, updateTodoList } from '../../../../src/contexts/todo/domain/ProjectTodoList'

describe('to-do autosave', () => {
  it('retains text and image bytes after a failed write and retries the same project and item', async () => {
    const api: TodoApi = {
      listTodos: vi.fn(async () => []),
      saveTodo: vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined),
      readTodoImage: vi.fn()
    }
    const session = new TodoSession(api, 'skiff')
    session.start()
    await vi.waitFor(() => expect(session.snapshot().loading).toBe(false))
    const id = crypto.randomUUID(),
      draft = { ...blankTodo(), text: 'fix the spacing', images: [id] }
    const images = [{ id, data: 'data:image/png;base64,Zm9v' }]
    session.change(draft, images)
    await vi.waitFor(() => expect(session.snapshot().saveFailed).toBe(true))
    expect(session.find(draft.id)).toMatchObject(draft)
    expect(await session.image(id)).toBe(images[0].data)
    session.retry()
    await vi.waitFor(() => expect(session.snapshot().saveFailed).toBe(false))
    expect(api.saveTodo).toHaveBeenLastCalledWith({
      projectId: 'skiff',
      draft: { ...draft, statusOrder: 1 },
      images
    })
  })
  it('preserves completion time across edits and clears it when reopened', () => {
    const draft = { ...blankTodo(), text: 'fix spacing', status: 'done' as const }
    const done = updateTodoList([], draft, 1)
    const edited = updateTodoList(done, { ...draft, text: 'fix sidebar spacing' }, 2)
    expect(edited[0].completedAt).toBe(1)
    expect(updateTodoList(edited, { ...draft, status: 'todo' }, 3)[0].completedAt).toBe(null)
  })
  it('restores the same group order when several offline status changes are retried together', async () => {
    const [a, b, c] = ['甲', '乙', '丙'].map((text) => ({ ...blankTodo(), text }))
    let stored = updateTodoList([], [a, b, c], 10)
    let offline = true
    const session = new TodoSession(
      {
        listTodos: async () => stored,
        readTodoImage: vi.fn(),
        saveTodo: async (command) => {
          if (offline) throw new Error('disk full')
          stored = updateTodoList(stored, 'draft' in command ? command.draft : command.drafts, 10)
        }
      },
      'project'
    )
    session.start()
    await vi.waitFor(() => expect(session.snapshot().loading).toBe(false))
    session.change({ ...a, status: 'active' })
    session.change({ ...b, status: 'active' })
    session.change({ ...b, status: 'todo' })
    session.change({ ...a, status: 'todo' })
    const titles = (items: typeof stored) => todosInStatus(items, 'todo').map((item) => item.text)
    expect(titles(session.snapshot().items)).toEqual(['甲', '乙', '丙'])
    await vi.waitFor(() => expect(session.snapshot().saveFailed).toBe(true))
    offline = false
    session.retry()
    await vi.waitFor(() => expect(session.snapshot().saveFailed).toBe(false))
    expect(titles(stored)).toEqual(['甲', '乙', '丙'])
  })
  it('keeps an unacknowledged split together with a newer edit when the first write fails', async () => {
    let rejectSplit!: (error: Error) => void
    const saveTodo = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            rejectSplit = reject
          })
      )
      .mockResolvedValue(undefined)
    const session = new TodoSession(
      { listTodos: vi.fn(async () => []), saveTodo, readTodoImage: vi.fn() },
      'project'
    )
    session.start()
    await vi.waitFor(() => expect(session.snapshot().loading).toBe(false))
    const parts = ['二', '一'].map((text) => ({ ...blankTodo(), text }))
    session.change(parts)
    const renamed = { ...parts[1], text: '第一条' }
    session.change(renamed)
    expect(saveTodo).toHaveBeenLastCalledWith({
      projectId: 'project',
      drafts: [
        { ...parts[0], statusOrder: 1 },
        { ...renamed, statusOrder: 2 }
      ],
      images: []
    })
    rejectSplit(new Error('disk full'))
    await Promise.resolve()
    expect(session.snapshot().saveFailed).toBe(false)
  })
  it('retries the whole failed split together and preserves the original list order', async () => {
    const saveTodo = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined)
    const session = new TodoSession(
      { listTodos: vi.fn(async () => []), saveTodo, readTodoImage: vi.fn() },
      'project'
    )
    session.start()
    await vi.waitFor(() => expect(session.snapshot().loading).toBe(false))
    const drafts = ['第三条', '第二条', '第一条'].map((text) => ({ ...blankTodo(), text }))
    session.change(drafts)
    await vi.waitFor(() => expect(session.snapshot().saveFailed).toBe(true))
    session.retry()
    await vi.waitFor(() => expect(session.snapshot().saveFailed).toBe(false))
    expect(saveTodo).toHaveBeenCalledTimes(2)
    expect(saveTodo.mock.calls[1]).toEqual(saveTodo.mock.calls[0])
    expect(session.snapshot().items.map((item) => item.id)).toEqual(drafts.map((item) => item.id))
  })
})
