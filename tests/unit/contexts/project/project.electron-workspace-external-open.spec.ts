import {
  ElectronWorkspaceExternalOpenAdapter,
  createVsCodeWorkspaceUri
} from '../../../../src/contexts/project/infrastructure/system/ElectronWorkspaceExternalOpenAdapter'

describe('Electron workspace external open adapter', () => {
  it.each([
    [
      'darwin',
      '/Users/nature/My Project/#demo?',
      'vscode://file/Users/nature/My%20Project/%23demo%3F/'
    ],
    ['win32', 'C:\\Work\\My Project', 'vscode://file/C:/Work/My%20Project/'],
    [
      'linux',
      '/home/nature/开发/clean code/',
      'vscode://file/home/nature/%E5%BC%80%E5%8F%91/clean%20code/'
    ],
    ['linux', '/work/foo\\bar', 'vscode://file/work/foo%5Cbar/']
  ] as const)('creates a safe %s VS Code workspace URI for %s', (platform, directory, expected) => {
    expect(createVsCodeWorkspaceUri(directory, platform)).toBe(expected)
  })

  it('reports the registered VS Code protocol handler without requiring application metadata', async () => {
    const getApplicationNameForProtocol = vi.fn(() => 'code.desktop')
    const adapter = createAdapter({
      getApplicationNameForProtocol
    })

    await expect(adapter.getCapabilities()).resolves.toEqual({
      vscode: { available: true }
    })
    expect(getApplicationNameForProtocol).toHaveBeenCalledWith('vscode://')
  })

  it('treats a missing protocol registration as unavailable', async () => {
    const adapter = createAdapter({
      getApplicationNameForProtocol: vi.fn(() => '')
    })

    await expect(adapter.getCapabilities()).resolves.toEqual({
      vscode: { available: false }
    })
  })

  it('opens VS Code through the fixed protocol after rechecking availability', async () => {
    const getApplicationNameForProtocol = vi.fn(() => 'Visual Studio Code')
    const openExternal = vi.fn(async () => undefined)
    const adapter = createAdapter({ getApplicationNameForProtocol, openExternal })

    await adapter.open({ directory: '/work/My Project', target: 'vscode' })

    expect(getApplicationNameForProtocol).toHaveBeenCalledWith('vscode://')
    expect(openExternal).toHaveBeenCalledWith('vscode://file/work/My%20Project/')
  })

  it('returns a stable unavailable error when VS Code loses protocol registration', async () => {
    const adapter = createAdapter({
      getApplicationNameForProtocol: vi.fn(() => '')
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
    getApplicationNameForProtocol: vi.fn(() => 'Visual Studio Code'),
    openExternal: vi.fn(async () => undefined),
    openPath: vi.fn(async () => ''),
    ...overrides
  })
}
