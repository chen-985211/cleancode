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

import '../../../../src/platform/electron-preload/preload'

const api = electronMocks.exposeInMainWorld.mock.calls[0]?.[1] as {
  createCanvasStack(command: unknown): Promise<unknown>
  moveCanvasStack(command: unknown): Promise<unknown>
  removeCanvasStack(command: unknown): Promise<unknown>
  setCanvasStackPresentation(command: unknown): Promise<unknown>
}

describe('canvas arrangement preload contract', () => {
  beforeEach(() => electronMocks.invoke.mockReset())

  it.each([
    ['createCanvasStack', 'cleancode:create-canvas-stack'],
    ['moveCanvasStack', 'cleancode:move-canvas-stack'],
    ['removeCanvasStack', 'cleancode:remove-canvas-stack'],
    ['setCanvasStackPresentation', 'cleancode:set-canvas-stack-presentation']
  ] as const)('forwards %s through its dedicated channel', async (method, channel) => {
    const command = { stackId: 'stack-1' }
    const snapshot = { projectId: 'project-1', workspaceId: 'main', stacks: [] }
    electronMocks.invoke.mockResolvedValue({ ok: true, value: snapshot })

    await expect(api[method](command)).resolves.toBe(snapshot)
    expect(electronMocks.invoke).toHaveBeenCalledWith(channel, command)
  })
})
