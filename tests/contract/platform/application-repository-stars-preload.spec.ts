const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMocks.exposeInMainWorld },
  ipcRenderer: { invoke: electronMocks.invoke },
  webUtils: {}
}))

import '../../../src/platform/electron-preload/preload'

const api = electronMocks.exposeInMainWorld.mock.calls[0]?.[1] as {
  getApplicationRepositoryStars?: () => Promise<number>
}

describe('application repository stars preload contract', () => {
  it('exposes a fixed repository query without accepting a URL or credentials', async () => {
    expect(api.getApplicationRepositoryStars).toBeTypeOf('function')
    electronMocks.invoke.mockResolvedValueOnce({ ok: true, value: 3200 })
    await expect(api.getApplicationRepositoryStars!()).resolves.toBe(3200)
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      'cleancode:get-application-repository-stars',
      undefined
    )
  })
})
