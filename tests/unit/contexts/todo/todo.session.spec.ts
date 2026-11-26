import { blankTodo, TodoSession } from '../../../../src/contexts/todo/presentation/TodoSession'
import type { TodoApi } from '../../../../src/contexts/todo/application/ProjectTodos'
import { todosInStatus, updateTodoList } from '../../../../src/contexts/todo/domain/ProjectTodoList'

describe('to-do autosave', () => {
  it('preserves group order across a batched deletion, creation and another status cycle', async () => {
    const highest = { ...blankTodo(), text: 'old', statusOrder: 10 }
    const a = { ...blankTodo(), text: 'A' }
    const b = { ...blankTodo(), text: 'B' }
    let stored = updateTodoList([], highest, 1)
    let release!: () => void
    const firstWrite = new Promise<void>((resolve) => {
      release = resolve
    })
    const saveTodo = vi.fn<TodoApi['saveTodo']>(async (command) => {
      await firstWrite
      stored = updateTodoList(stored, 'drafts' in command ? command.drafts : command.draft, 2)
    })
    const session = new TodoSession(
      { listTodos: async () => stored, readTodoImage: vi.fn(), saveTodo },
      'project'
    )
    session.start()
    await vi.waitFor(() => expect(session.snapshot().loading).toBe(false))
    session.change({ ...highest, note: 'saving' })
    session.change({ ...highest, text: '' })
    session.change([a, b])
    // Hand off the coalesced delete and inserts while the preceding save is still in flight.
    session.flushOnPageHide()
    for (const status of ['active', 'done', 'todo'] as const) session.change({ ...a, status })
    release()
    await vi.waitFor(() => expect(saveTodo).toHaveBeenCalledTimes(3))
    const order = (items: typeof stored) =>
      todosInStatus(items, 'todo').map(({ text, statusOrder }) => ({ text, statusOrder }))
    expect(order(stored)).toEqual(order(session.snapshot().items))
    expect(order(stored).map(({ text }) => text)).toEqual(['A', 'B'])
  })
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
  it('records a new completion after a round trip to the same stored status and keeps retries idempotent', () => {
    const draft = { ...blankTodo(), text: '复核', status: 'done' as const }
    const first = updateTodoList([], draft, 10)
    const reopened = updateTodoList(first, { ...draft, status: 'todo' }, 20)
    const active = updateTodoList(reopened, { ...draft, status: 'active' }, 21)
    const [completedAgain] = updateTodoList(active, draft, 22)
    const retried = updateTodoList(first, completedAgain, 30)
    expect(retried[0].completedAt).toBe(22)
    expect(updateTodoList(retried, completedAgain, 40)[0].completedAt).toBe(22)
    expect(
      updateTodoList(first, { ...draft, statusOrder: completedAgain.statusOrder }, 30)[0]
        .completedAt
    ).toBe(30)
  })

  it('coalesces edits made during an image save and sends only the latest text after acknowledgement', async () => {
    let acknowledge!: () => void
    const saveTodo = vi
      .fn<TodoApi['saveTodo']>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            acknowledge = resolve
          })
      )
      .mockResolvedValue(undefined)
    const session = new TodoSession(
      { listTodos: async () => [], readTodoImage: vi.fn(), saveTodo },
      'project'
    )
    session.start()
    await vi.waitFor(() => expect(session.snapshot().loading).toBe(false))
    const image = { id: crypto.randomUUID(), data: 'data:image/png;base64,AAAA' }
    const draft = { ...blankTodo(), text: '原文', images: [image.id] }
    session.change(draft, [image])
    for (let i = 1; i <= 20; i++) session.change({ ...draft, text: String(i) })
    expect(session.find(draft.id)?.text).toBe('20')
    expect(saveTodo).toHaveBeenCalledTimes(1)
    acknowledge()
    await vi.waitFor(() => expect(saveTodo).toHaveBeenCalledTimes(2))
    expect(saveTodo).toHaveBeenLastCalledWith({
      projectId: 'project',
      draft: { ...draft, text: '20', statusOrder: 1 },
      images: []
    })
  })
  it('hands off the latest pending draft once when the renderer leaves during a save', async () => {
    let rejectOld!: (error: Error) => void
    const saveTodo = vi
      .fn<TodoApi['saveTodo']>()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectOld = reject
          })
      )
      .mockResolvedValue(undefined)
    const session = new TodoSession(
      { listTodos: async () => [], readTodoImage: vi.fn(), saveTodo },
      'project'
    )
    session.start()
    await vi.waitFor(() => expect(session.snapshot().loading).toBe(false))
    const draft = { ...blankTodo(), text: '第一版' }
    session.change(draft)
    session.change({ ...draft, text: '最后一版' })
    session.flushOnPageHide()
    session.flushOnPageHide()
    expect(saveTodo).toHaveBeenCalledTimes(2)
    expect(saveTodo.mock.lastCall?.[0]).toMatchObject({
      projectId: 'project',
      draft: { text: '最后一版' }
    })
    rejectOld(new Error('first write failed'))
    await Promise.resolve()
    expect(session.snapshot().saveFailed).toBe(false)
  })
  it('restores the same group order when several offline status changes are retried together', async () => {
    const [a, b, c] = ['甲', '乙', '丙'].map((text) => ({ ...blankTodo(), text }))
    const done = { ...blankTodo(), text: '丁', status: 'done' as const }
    let stored = updateTodoList([], [a, b, c, done], 10)
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
    session.change({ ...done, status: 'todo' })
    session.change({ ...done, status: 'active' })
    session.change(done)
    const completedOffline = session.find(done.id)!.completedAt
    expect(completedOffline).toBeGreaterThan(10)
    const titles = (items: typeof stored) => todosInStatus(items, 'todo').map((item) => item.text)
    expect(titles(session.snapshot().items)).toEqual(['甲', '乙', '丙'])
    await vi.waitFor(() => expect(session.snapshot().saveFailed).toBe(true))
    offline = false
    session.retry()
    await vi.waitFor(() => expect(session.snapshot().saveFailed).toBe(false))
    expect(titles(stored)).toEqual(['甲', '乙', '丙'])
    expect(stored.find((item) => item.id === done.id)?.completedAt).toBe(completedOffline)
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
    expect(saveTodo).toHaveBeenCalledTimes(1)
    rejectSplit(new Error('disk full'))
    await vi.waitFor(() => expect(saveTodo).toHaveBeenCalledTimes(2))
    expect(saveTodo).toHaveBeenLastCalledWith({
      projectId: 'project',
      drafts: [
        { ...parts[0], statusOrder: 1 },
        { ...renamed, statusOrder: 2 }
      ],
      images: []
    })
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
