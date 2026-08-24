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
  getWorkspaceExternalOpenCapabilities(): Promise<unknown>
  openWorkspaceExternally(command: unknown): Promise<void>
}

describe('workspace external open preload contract', () => {
  beforeEach(() => electronMocks.invoke.mockReset())

  it('forwards capability discovery without a command payload', async () => {
    const capabilities = { vscode: { available: true, iconDataUrl: null } }
    electronMocks.invoke.mockResolvedValue({ ok: true, value: capabilities })

    await expect(api.getWorkspaceExternalOpenCapabilities()).resolves.toBe(capabilities)
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      'cleancode:get-workspace-external-open-capabilities',
      undefined
    )
  })

  it('forwards only the declared workspace open command', async () => {
    const command = {
      projectDirectory: '/work/app',
      target: 'folder',
      workspaceId: 'main'
    }
    electronMocks.invoke.mockResolvedValue({ ok: true, value: undefined })

    await expect(api.openWorkspaceExternally(command)).resolves.toBeUndefined()
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      'cleancode:open-workspace-externally',
      command
    )
  })
})
