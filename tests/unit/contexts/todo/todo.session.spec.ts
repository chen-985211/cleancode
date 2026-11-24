import { blankTodo, TodoSession } from '../../../../src/contexts/todo/presentation/TodoSession'
import type { TodoApi } from '../../../../src/contexts/todo/application/ProjectTodos'
import { updateTodoList } from '../../../../src/contexts/todo/domain/ProjectTodoList'

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
    expect(api.saveTodo).toHaveBeenLastCalledWith({ projectId: 'skiff', draft, images })
  })
  it('preserves completion time across edits and clears it when reopened', () => {
    const draft = { ...blankTodo(), text: 'fix spacing', status: 'done' as const }
    const done = updateTodoList([], draft, 1)
    const edited = updateTodoList(done, { ...draft, text: 'fix sidebar spacing' }, 2)
    expect(edited[0].completedAt).toBe(1)
    expect(updateTodoList(edited, { ...draft, status: 'todo' }, 3)[0].completedAt).toBe(null)
  })
})
