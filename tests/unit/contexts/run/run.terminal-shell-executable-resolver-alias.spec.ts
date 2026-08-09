// @vitest-environment node

import { win32 as pathWin32 } from 'node:path'

const aliasSystem = vi.hoisted(() => ({
  execFile: vi.fn(),
  existingExecutables: new Set<string>(),
  existsSync: vi.fn(),
  readlink: vi.fn(),
  statSync: vi.fn()
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    execFile: aliasSystem.execFile
  }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    existsSync: aliasSystem.existsSync,
    statSync: aliasSystem.statSync
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    readlink: aliasSystem.readlink
  }
})

const WINDOWS_APPS = String.raw`C:\Users\dev\AppData\Local\Microsoft\WindowsApps`
const STORE_ALIAS = pathWin32.join(WINDOWS_APPS, 'pwsh.exe')
const STORE_EXECUTABLE = String.raw`C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.0.0_x64__8wekyb3d8bbwe\pwsh.exe`
const PROGRAM_FILES_PWSH = String.raw`C:\Program Files\PowerShell\7\pwsh.exe`
const DISCOVERED_EXECUTABLE = String.raw`C:\Program Files\PowerShell\7\pwsh.exe`
const DISCOVERED_HOME = pathWin32.dirname(DISCOVERED_EXECUTABLE)
const WINDOWS_POWERSHELL = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`

describe('terminal shell executable resolver Store alias readlink', () => {
  beforeEach(() => {
    vi.resetModules()
    aliasSystem.execFile.mockReset()
    aliasSystem.existingExecutables.clear()
    aliasSystem.existsSync.mockReset()
    aliasSystem.existsSync.mockImplementation((candidate: unknown) =>
      aliasSystem.existingExecutables.has(pathWin32.normalize(String(candidate)).toLowerCase())
    )
    aliasSystem.readlink.mockReset()
    aliasSystem.statSync.mockReset()
    aliasSystem.statSync.mockReturnValue({
      isFile: () => true,
      size: 1
    })
    configureDefaultWindowsEnvironment()
    rejectAliasDiscovery(new Error('unexpected process discovery'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not inspect a Store alias when a standard real pwsh exists', async () => {
    vi.stubEnv('ProgramW6432', String.raw`C:\Program Files`)
    markExecutableAsExisting(PROGRAM_FILES_PWSH)

    await expect(resolveDefaultWindowsShell()).resolves.toBe(PROGRAM_FILES_PWSH)

    expect(aliasSystem.readlink).not.toHaveBeenCalled()
    expect(aliasSystem.execFile).not.toHaveBeenCalled()
  })

  it('returns a safe real readlink target without launching discovery', async () => {
    aliasSystem.readlink.mockResolvedValue(STORE_EXECUTABLE)
    markExecutableAsExisting(STORE_EXECUTABLE)

    await expect(resolveDefaultWindowsShell()).resolves.toBe(STORE_EXECUTABLE)

    expect(aliasSystem.readlink.mock.calls[0]?.[0]).toBe(STORE_ALIAS)
    expect(aliasSystem.execFile).not.toHaveBeenCalled()
  })

  it('resolves a relative readlink target against the alias directory without discovery', async () => {
    const relativeTarget = String.raw`..\PowerShell\7\pwsh.exe`
    const resolvedTarget = pathWin32.resolve(pathWin32.dirname(STORE_ALIAS), relativeTarget)
    aliasSystem.readlink.mockResolvedValue(relativeTarget)
    markExecutableAsExisting(resolvedTarget)

    await expect(resolveDefaultWindowsShell()).resolves.toBe(resolvedTarget)

    expect(aliasSystem.execFile).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'readlink failure',
      readlink: () => {
        throw new Error('not a readable reparse point')
      }
    },
    {
      name: 'another WindowsApps alias',
      readlink: () => STORE_ALIAS,
      existingTarget: STORE_ALIAS
    },
    {
      name: 'a non-pwsh executable',
      readlink: () => String.raw`C:\Tools\powershell.exe`,
      existingTarget: String.raw`C:\Tools\powershell.exe`
    },
    {
      name: 'a missing pwsh executable',
      readlink: () => String.raw`C:\Missing\pwsh.exe`
    },
    {
      name: 'a root-relative pwsh path',
      readlink: () => String.raw`\Tools\pwsh.exe`,
      existingTarget: String.raw`\Tools\pwsh.exe`
    },
    {
      name: 'a UNC pwsh path',
      readlink: () => String.raw`\\server\share\pwsh.exe`,
      existingTarget: String.raw`\\server\share\pwsh.exe`
    },
    {
      name: 'a device-namespace pwsh path',
      readlink: () => String.raw`\\?\C:\Tools\pwsh.exe`,
      existingTarget: String.raw`\\?\C:\Tools\pwsh.exe`
    }
  ])('uses bounded process discovery only after $name', async ({ readlink, existingTarget }) => {
    aliasSystem.readlink.mockImplementation(readlink)
    if (existingTarget) markExecutableAsExisting(existingTarget)
    markExecutableAsExisting(DISCOVERED_EXECUTABLE)
    completeAliasDiscovery(null, DISCOVERED_HOME)

    await expect(resolveDefaultWindowsShell()).resolves.toBe(DISCOVERED_EXECUTABLE)

    expect(aliasSystem.readlink).toHaveBeenCalledOnce()
    expect(aliasSystem.execFile).toHaveBeenCalledOnce()
    expect(aliasSystem.readlink.mock.invocationCallOrder[0]).toBeLessThan(
      aliasSystem.execFile.mock.invocationCallOrder[0]
    )
    expectDiscoveryHelperContract()
  })

  it.each([
    {
      name: 'a zero-byte executable',
      invalidStat: { isFile: () => true, size: 0 }
    },
    {
      name: 'a directory',
      invalidStat: { isFile: () => false, size: 1 }
    }
  ])('uses process discovery when readlink resolves to $name', async ({ invalidStat }) => {
    const invalidTarget = String.raw`C:\Broken\pwsh.exe`
    aliasSystem.readlink.mockResolvedValue(invalidTarget)
    markExecutableAsExisting(invalidTarget)
    markExecutableAsExisting(DISCOVERED_EXECUTABLE)
    aliasSystem.statSync.mockImplementation((candidate: unknown) =>
      pathWin32.normalize(String(candidate)).toLowerCase() ===
      pathWin32.normalize(invalidTarget).toLowerCase()
        ? invalidStat
        : { isFile: () => true, size: 1 }
    )
    completeAliasDiscovery(null, DISCOVERED_HOME)

    await expect(resolveDefaultWindowsShell()).resolves.toBe(DISCOVERED_EXECUTABLE)

    expect(aliasSystem.execFile).toHaveBeenCalledOnce()
    expectDiscoveryHelperContract()
  })

  it('falls back to inbox PowerShell when process discovery fails', async () => {
    aliasSystem.readlink.mockRejectedValue(new Error('not a readable reparse point'))
    rejectAliasDiscovery(new Error('pwsh discovery failed'))

    await expect(resolveDefaultWindowsShell()).resolves.toBe(WINDOWS_POWERSHELL)

    expect(aliasSystem.execFile).toHaveBeenCalledOnce()
    expectDiscoveryHelperContract()
  })

  it.each([
    ['relative output', 'relative-powershell-home'],
    ['another WindowsApps alias', WINDOWS_APPS],
    ['a missing executable', String.raw`C:\Missing\PowerShell\7`]
  ])('falls back to inbox PowerShell for unsafe discovery %s', async (_name, stdout) => {
    aliasSystem.readlink.mockRejectedValue(new Error('not a readable reparse point'))
    completeAliasDiscovery(null, stdout)

    await expect(resolveDefaultWindowsShell()).resolves.toBe(WINDOWS_POWERSHELL)

    expect(aliasSystem.execFile).toHaveBeenCalledOnce()
    expectDiscoveryHelperContract()
  })
})

async function resolveDefaultWindowsShell(): Promise<string> {
  const { resolveTerminalShellExecutable } =
    await import('../../../../src/contexts/run/infrastructure/pty/TerminalShellExecutableResolver')
  return resolveTerminalShellExecutable({ platform: 'win32' })
}

function configureDefaultWindowsEnvironment(): void {
  vi.stubEnv('ProgramW6432', '')
  vi.stubEnv('ProgramFiles', '')
  vi.stubEnv('ProgramFiles(x86)', '')
  vi.stubEnv('LOCALAPPDATA', '')
  vi.stubEnv('PATH', WINDOWS_APPS)
  vi.stubEnv('SystemRoot', String.raw`C:\Windows`)
}

function markExecutableAsExisting(executable: string): void {
  aliasSystem.existingExecutables.add(pathWin32.normalize(executable).toLowerCase())
}

function completeAliasDiscovery(error: Error | null, stdout = ''): void {
  aliasSystem.execFile.mockImplementation((...arguments_: unknown[]) => {
    const callback = arguments_.at(-1)
    if (typeof callback !== 'function') throw new TypeError('expected execFile callback')
    callback(error, stdout, '')
  })
}

function rejectAliasDiscovery(error: Error): void {
  completeAliasDiscovery(error)
}

function expectDiscoveryHelperContract(): void {
  const [executable, arguments_, options] = aliasSystem.execFile.mock.calls[0] ?? []
  expect(executable).toBe('pwsh.exe')
  expect(arguments_).toEqual([
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '[Console]::Write($PSHOME)'
  ])
  expect(options).toMatchObject({
    cwd: WINDOWS_APPS,
    encoding: 'utf8',
    windowsHide: true
  })
  expect(options.timeout).toBe(2_500)
}
