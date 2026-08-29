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

import type { TerminalWorkingDirectoryChangedEvent } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import '../../../../src/platform/electron-preload/preload'

const api = electronMocks.exposeInMainWorld.mock.calls[0]?.[1] as {
  onTerminalWorkingDirectoryChanged(
    listener: (event: TerminalWorkingDirectoryChangedEvent) => void
  ): () => void
}

describe('terminal working-directory preload contract', () => {
  beforeEach(() => {
    electronMocks.on.mockReset()
    electronMocks.removeListener.mockReset()
  })

  it('subscribes to and precisely removes working-directory events', () => {
    const listener = vi.fn()
    const event = {
      sessionId: 'terminal-session-1',
      workingDirectory: '/work/app/src',
      revision: 2
    } as TerminalWorkingDirectoryChangedEvent
    const unsubscribe = api.onTerminalWorkingDirectoryChanged(listener)
    const subscription = electronMocks.on.mock.calls.find(
      ([channel]) => channel === 'cleancode:terminal-working-directory-changed'
    )?.[1]

    expect(subscription).toEqual(expect.any(Function))
    subscription({}, event)
    expect(listener).toHaveBeenCalledWith(event)

    unsubscribe()
    expect(electronMocks.removeListener).toHaveBeenCalledWith(
      'cleancode:terminal-working-directory-changed',
      subscription
    )
  })
})
