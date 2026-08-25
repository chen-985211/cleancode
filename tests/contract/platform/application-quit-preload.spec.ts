const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  getPathForFile: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener
  },
  webUtils: { getPathForFile: electronMocks.getPathForFile }
}))

import type {
  ApplicationQuitConfirmationCommand,
  ApplicationQuitRequest
} from '../../../src/platform/ipc/applicationQuitChannels'
import '../../../src/platform/electron-preload/preload'

interface ApplicationQuitBridge {
  showApplicationQuitConfirmation(command: ApplicationQuitConfirmationCommand): Promise<boolean>
  onApplicationQuitRequested(listener: (request: ApplicationQuitRequest) => void): () => void
}

const api = electronMocks.exposeInMainWorld.mock.calls[0]?.[1] as ApplicationQuitBridge

describe('application quit preload contract', () => {
  beforeEach(() => {
    electronMocks.invoke.mockReset()
    electronMocks.on.mockReset()
    electronMocks.removeListener.mockReset()
  })

  it('forwards native confirmation copy through its dedicated channel', async () => {
    const command = {
      cancelLabel: '取消',
      confirmLabel: '退出',
      message: '退出 cleancode？',
      requestId: 'quit-request-1'
    }
    electronMocks.invoke.mockResolvedValue({ ok: true, value: true })

    await expect(api.showApplicationQuitConfirmation(command)).resolves.toBe(true)
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      'cleancode:show-application-quit-confirmation',
      command
    )
  })

  it('subscribes to and precisely removes confirmation requests', () => {
    const listener = vi.fn()
    const request = { requestId: 'quit-request-1' }
    const unsubscribe = api.onApplicationQuitRequested(listener)
    const subscription = electronMocks.on.mock.calls.find(
      ([channel]) => channel === 'cleancode:application-quit-requested'
    )?.[1]

    expect(subscription).toEqual(expect.any(Function))
    subscription({}, request)
    expect(listener).toHaveBeenCalledWith(request)

    unsubscribe()
    expect(electronMocks.removeListener).toHaveBeenCalledWith(
      'cleancode:application-quit-requested',
      subscription
    )
  })
})
