import { WorkspaceDefaultsAutosave } from '../../../src/presentation/app-shell/coordinators/WorkspaceDefaultsAutosave'
import type { WorkspaceDefaults } from '../../../src/contexts/project/application/dto/WorkspaceInitializationDetails'

const value = (count: number): WorkspaceDefaults => ({
  templates: [],
  agents: [{ providerId: 'test-provider', count }]
})
function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
describe('workspace defaults autosave', () => {
  it('serializes writes and coalesces rapid edits without losing the latest draft', async () => {
    const first = deferred()
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    const store = new WorkspaceDefaultsAutosave(save)
    store.seed('/project', value(1))
    store.edit('/project', value(2))
    store.edit('/project', value(3))
    store.edit('/project', value(4))
    expect(store.get('/project')?.value).toEqual(value(4))
    expect(save).toHaveBeenCalledTimes(1)
    first.resolve()
    await store.flush('/project')
    expect(save.mock.calls).toEqual([
      ['/project', value(2)],
      ['/project', value(4)]
    ])
    expect(store.get('/project')?.status).toBe('saved')
  })
  it('keeps failed edits across switching away and retries the latest value', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValue(undefined)
    const store = new WorkspaceDefaultsAutosave(save)
    const notify = vi.fn()
    const unsubscribe = store.subscribe(notify)
    store.edit('/a', value(2))
    unsubscribe()
    await expect(store.flush('/a')).rejects.toThrow('disk unavailable')
    store.seed('/a', value(1))
    expect(store.get('/a')).toMatchObject({ value: value(2), status: 'error' })
    store.edit('/b', value(3))
    await store.flush('/b')
    expect(store.get('/a')?.status).toBe('error')
    await store.retry('/a')
    expect(store.get('/a')).toMatchObject({ value: value(2), status: 'saved' })
  })
  it('saves a newer edit even when an older in-flight write fails', async () => {
    const first = deferred()
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    const store = new WorkspaceDefaultsAutosave(save)
    store.edit('/a', value(1))
    store.edit('/a', value(2))
    first.reject(new Error('old failure'))
    await store.flush('/a')
    expect(store.get('/a')).toMatchObject({ value: value(2), status: 'saved' })
  })
})
