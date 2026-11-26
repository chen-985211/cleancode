// @vitest-environment jsdom
const electron = vi.hoisted(() => ({ expose: vi.fn(), invoke: vi.fn(), sendSync: vi.fn() }))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.expose },
  ipcRenderer: { invoke: electron.invoke, sendSync: electron.sendSync },
  webUtils: {}
}))
import { blankTodo, TodoSession } from '../../../src/contexts/todo/presentation/TodoSession'
import { todoChannels } from '../../../src/platform/ipc/todoChannels'
import '../../../src/platform/electron-preload/preload'

it('hands off all projects before the window unloads, then waits only when writes are outstanding', async () => {
  const api: NonNullable<Window['cleancode']> = electron.expose.mock.calls[0][1]
  const writes: string[] = []
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  electron.invoke.mockImplementation(async (channel, command) => {
    if (channel === todoChannels.list) return { ok: true, value: [] }
    writes.push(command.draft.text)
    await pending
    return { ok: true, value: undefined }
  })
  electron.sendSync.mockImplementation(() => {
    expect(writes).toEqual(['a', 'b', 'last a', 'last b'])
    return { ok: true, value: true }
  })
  const projects = ['a', 'b'].map((key) => new TodoSession(api, key))
  const unsubscribe = api.onTodoPageHide!(() =>
    projects.forEach((session) => session.flushOnPageHide())
  )
  projects.forEach((s) => s.start())
  await vi.waitFor(() => expect(projects.every((s) => !s.snapshot().loading)).toBe(true))
  window.dispatchEvent(new Event('pagehide'))
  expect(electron.sendSync).not.toHaveBeenCalled()
  for (const [index, text] of ['a', 'b'].entries()) {
    const draft = { ...blankTodo(), text }
    projects[index].change(draft)
    projects[index].change({ ...draft, text: 'last ' + text })
  }
  expect(writes).toEqual(['a', 'b'])
  window.dispatchEvent(new Event('pagehide'))
  expect(electron.sendSync).toHaveBeenCalledWith(todoChannels.drain)
  expect(electron.sendSync).toHaveBeenCalledOnce()
  release()
  await vi.waitFor(() =>
    expect(electron.invoke.mock.settledResults.every((r) => r.type === 'fulfilled')).toBe(true)
  )
  unsubscribe()
  window.dispatchEvent(new Event('pagehide'))
  expect(electron.sendSync).toHaveBeenCalledOnce()
})
