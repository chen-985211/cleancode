import {
  ElectronWorkspaceExternalOpenAdapter,
  createVsCodeWorkspaceUri
} from '../../../../src/contexts/project/infrastructure/system/ElectronWorkspaceExternalOpenAdapter'

describe('Electron workspace external open adapter', () => {
  it.each([
    ['/Users/nature/My Project/#demo?', 'vscode://file/Users/nature/My%20Project/%23demo%3F/'],
    ['C:\\Work\\My Project', 'vscode://file/C:/Work/My%20Project/'],
    ['/home/nature/开发/clean code/', 'vscode://file/home/nature/%E5%BC%80%E5%8F%91/clean%20code/']
  ])('creates a safe VS Code workspace URI for %s', (directory, expected) => {
    expect(createVsCodeWorkspaceUri(directory)).toBe(expected)
  })

  it('reports the registered VS Code protocol handler and its icon', async () => {
    const adapter = createAdapter({
      getApplicationInfoForProtocol: vi.fn(async () => ({
        icon: { toDataURL: () => 'data:image/png;base64,vscode' },
        name: 'Visual Studio Code',
        path: '/Applications/Visual Studio Code.app'
      }))
    })

    await expect(adapter.getCapabilities()).resolves.toEqual({
      vscode: { available: true, iconDataUrl: 'data:image/png;base64,vscode' }
    })
  })

  it('treats a missing protocol registration as unavailable', async () => {
    const adapter = createAdapter({
      getApplicationInfoForProtocol: vi.fn(async () => {
        throw new Error('no handler')
      })
    })

    await expect(adapter.getCapabilities()).resolves.toEqual({
      vscode: { available: false, iconDataUrl: null }
    })
  })

  it('opens VS Code through the fixed protocol after rechecking availability', async () => {
    const getApplicationInfoForProtocol = vi.fn(async () => ({
      icon: { toDataURL: () => '' },
      name: 'Visual Studio Code',
      path: '/Applications/Visual Studio Code.app'
    }))
    const openExternal = vi.fn(async () => undefined)
    const adapter = createAdapter({ getApplicationInfoForProtocol, openExternal })

    await adapter.open({ directory: '/work/My Project', target: 'vscode' })

    expect(getApplicationInfoForProtocol).toHaveBeenCalledWith('vscode://')
    expect(openExternal).toHaveBeenCalledWith('vscode://file/work/My%20Project/')
  })

  it('returns a stable unavailable error when VS Code loses protocol registration', async () => {
    const adapter = createAdapter({
      getApplicationInfoForProtocol: vi.fn(async () => {
        throw new Error('no handler')
      })
    })

    await expect(adapter.open({ directory: '/work/app', target: 'vscode' })).rejects.toMatchObject({
      code: 'WORKSPACE_OPEN_TARGET_UNAVAILABLE',
      isExpected: true
    })
  })

  it('opens folders with the system file manager and maps its error result', async () => {
    const openPath = vi.fn().mockResolvedValueOnce('').mockResolvedValueOnce('permission denied')
    const adapter = createAdapter({ openPath })

    await expect(
      adapter.open({ directory: '/work/app', target: 'folder' })
    ).resolves.toBeUndefined()
    await expect(
      adapter.open({ directory: '/work/private', target: 'folder' })
    ).rejects.toMatchObject({ code: 'WORKSPACE_EXTERNAL_OPEN_FAILED', isExpected: true })
    expect(openPath).toHaveBeenNthCalledWith(1, '/work/app')
    expect(openPath).toHaveBeenNthCalledWith(2, '/work/private')
  })
})

function createAdapter(
  overrides: Partial<ConstructorParameters<typeof ElectronWorkspaceExternalOpenAdapter>[0]> = {}
) {
  return new ElectronWorkspaceExternalOpenAdapter({
    getApplicationInfoForProtocol: vi.fn(async () => ({
      icon: { toDataURL: () => 'data:image/png;base64,vscode' },
      name: 'Visual Studio Code',
      path: '/Applications/Visual Studio Code.app'
    })),
    openExternal: vi.fn(async () => undefined),
    openPath: vi.fn(async () => ''),
    ...overrides
  })
}
