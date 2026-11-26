import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerProjectTodos } from '../../../src/platform/electron-main/projectTodosRuntime'
import { todoChannels } from '../../../src/platform/ipc/todoChannels'
describe('project to-do IPC', () => {
  it('validates attachment, save and shutdown requests', async () => {
    const handlers = new Map<string, (event: unknown, command?: unknown) => Promise<unknown>>()
    const directory = await mkdtemp(join(tmpdir(), 'cc-todo-ipc-'))
    onTestFinished(() => rm(directory, { recursive: true, force: true }))
    registerProjectTodos(
      directory,
      {
        on: (key, listener) => {
          handlers.set(
            key,
            (_event, command) =>
              new Promise((resolve) =>
                listener(
                  {
                    set returnValue(reply: unknown) {
                      resolve(reply)
                    }
                  },
                  command
                )
              )
          )
        },
        handle: (key, fn) => {
          handlers.set(key, fn)
        }
      },
      { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    )
    const call = (key: string, value: unknown) => handlers.get(key)!(null, value)
    const invalid = { ok: false, error: { code: 'INVALID_IPC_COMMAND' } }
    await expect(call(todoChannels.drain, 'unexpected')).resolves.toMatchObject(invalid)
    await expect(
      call(todoChannels.image, { projectId: 'project', id: '../x' })
    ).resolves.toMatchObject(invalid)
    const draft = {
      id: '9bb13e32-e26c-485b-b1bf-f60fcea360e7',
      text: 'x',
      note: '',
      images: [],
      links: ['file:///x'],
      status: 'todo'
    }
    await expect(call(todoChannels.save, { projectId: 'project', draft })).resolves.toMatchObject(
      invalid
    )
    const valid = { ...draft, links: [] }
    for (const payload of [
      { drafts: [] },
      { drafts: [valid, draft] },
      { drafts: [valid, valid] },
      { draft: valid, drafts: [valid] },
      { draft: { ...valid, statusOrder: -1 } },
      { draft: { ...valid, statusOrder: 1.5 } },
      { draft: { ...valid, completedAt: 'yesterday' } },
      { draft: { ...valid, completedAt: Infinity } }
    ]) {
      await expect(
        call(todoChannels.save, { projectId: 'project', ...payload })
      ).resolves.toMatchObject(invalid)
    }
    await expect(
      call(todoChannels.save, {
        projectId: 'project',
        drafts: [valid, { ...valid, id: crypto.randomUUID() }]
      })
    ).resolves.toMatchObject({ ok: true })
    await expect(call(todoChannels.drain, undefined)).resolves.toEqual({ ok: true, value: true })
  })
})
