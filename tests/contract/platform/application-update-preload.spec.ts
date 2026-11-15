const mocks = vi.hoisted(() => ({ expose: vi.fn(), invoke: vi.fn(), on: vi.fn(), remove: vi.fn() }))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: { invoke: mocks.invoke, on: mocks.on, removeListener: mocks.remove },
  webUtils: {}
}))
import '../../../src/platform/electron-preload/preload'

describe('application update preload', () => {
  const api = () =>
    mocks.expose.mock.calls[0]![1] as Record<string, (...args: unknown[]) => unknown>
  it('exposes only fixed queries and an exact-version install command', async () => {
    expect(api().getApplicationUpdate).toBeTypeOf('function')
    mocks.invoke.mockResolvedValue({ ok: true, value: { status: 'idle', revision: 0 } })
    await api().getApplicationUpdate!()
    await api().checkApplicationUpdate!()
    await api().installApplicationUpdate!({ version: '0.2.0' })
    expect(mocks.invoke.mock.calls).toEqual([
      ['cleancode:get-application-update', undefined],
      ['cleancode:check-application-update', undefined],
      ['cleancode:install-application-update', { version: '0.2.0' }]
    ])
  })
  it('subscribes and unsubscribes the same update event callback', () => {
    expect(api().onApplicationUpdateChanged).toBeTypeOf('function')
    const listener = vi.fn()
    const unsubscribe = api().onApplicationUpdateChanged!(listener) as () => void
    const [channel, callback] = mocks.on.mock.calls[0]!
    callback({}, { revision: 2, status: 'ready' })
    expect(listener).toHaveBeenCalledWith({ revision: 2, status: 'ready' })
    unsubscribe()
    expect(mocks.remove).toHaveBeenCalledWith(channel, callback)
  })
})
