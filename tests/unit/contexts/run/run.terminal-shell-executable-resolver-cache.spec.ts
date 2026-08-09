// @vitest-environment node

const resolverSystem = vi.hoisted(() => ({
  execFile: vi.fn(),
  existingExecutables: new Set<string>(),
  existsSync: vi.fn(),
  now: 0,
  statSync: vi.fn()
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    execFile: resolverSystem.execFile
  }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    existsSync: resolverSystem.existsSync,
    statSync: resolverSystem.statSync
  }
})

import * as terminalShellResolver from '../../../../src/contexts/run/infrastructure/pty/TerminalShellExecutableResolver'

const CACHE_BOUNDARY_MS = 24 * 60 * 60_000
const PROGRAM_FILES = String.raw`C:\Program Files`
const PROGRAM_FILES_PWSH = String.raw`C:\Program Files\PowerShell\7\pwsh.exe`
const WINDOWS_APPS = String.raw`C:\Users\dev\AppData\Local\Microsoft\WindowsApps`
const WINDOWS_POWERSHELL = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`

type ResolverModule = typeof terminalShellResolver
type ResolverModuleWithQuarantine = ResolverModule & {
  quarantineAutomaticWindowsPowerShellExecutable(executable: string): void
}

describe('terminal shell executable resolver default cache', () => {
  beforeEach(() => {
    resolverSystem.execFile.mockReset()
    resolverSystem.existingExecutables.clear()
    resolverSystem.existsSync.mockReset()
    resolverSystem.existsSync.mockImplementation((candidate: unknown) =>
      resolverSystem.existingExecutables.has(String(candidate).toLowerCase())
    )
    resolverSystem.statSync.mockReset()
    resolverSystem.statSync.mockReturnValue({
      isFile: () => true,
      size: 1
    })
    resolverSystem.now += CACHE_BOUNDARY_MS
    vi.spyOn(Date, 'now').mockImplementation(() => resolverSystem.now)
    configureDefaultWindowsEnvironment()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('reuses an automatic pwsh result only until its bounded cache expires', async () => {
    resolverSystem.existingExecutables.add(PROGRAM_FILES_PWSH.toLowerCase())
    const { resolveTerminalShellExecutable } = getResolverModule()

    await expect(resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
      PROGRAM_FILES_PWSH
    )
    const probesAfterInitialResolution = resolverSystem.existsSync.mock.calls.length

    resolverSystem.existingExecutables.clear()
    await expect(resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
      PROGRAM_FILES_PWSH
    )
    expect(resolverSystem.existsSync).toHaveBeenCalledTimes(probesAfterInitialResolution)

    advancePastEveryFiniteCacheTtl()
    await expect(resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
      WINDOWS_POWERSHELL
    )
    expect(resolverSystem.existsSync.mock.calls.length).toBeGreaterThan(
      probesAfterInitialResolution
    )
  })

  it('re-probes an automatic inbox PowerShell result after its bounded cache expires', async () => {
    const { resolveTerminalShellExecutable } = getResolverModule()

    await expect(resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
      WINDOWS_POWERSHELL
    )
    const probesAfterInitialResolution = resolverSystem.existsSync.mock.calls.length

    resolverSystem.existingExecutables.add(PROGRAM_FILES_PWSH.toLowerCase())
    await expect(resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
      WINDOWS_POWERSHELL
    )
    expect(resolverSystem.existsSync).toHaveBeenCalledTimes(probesAfterInitialResolution)

    advancePastEveryFiniteCacheTtl()
    await expect(resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
      PROGRAM_FILES_PWSH
    )
    expect(resolverSystem.existsSync.mock.calls.length).toBeGreaterThan(
      probesAfterInitialResolution
    )
  })

  it('shares an in-flight probe but retries after that shared resolution rejects', async () => {
    vi.stubEnv('PATH', WINDOWS_APPS)
    const transientFailure = new Error('transient alias discovery failure')
    resolverSystem.execFile.mockImplementationOnce(() => {
      throw transientFailure
    })
    const { resolveTerminalShellExecutable } = getResolverModule()

    const sharedResults = await Promise.allSettled([
      resolveTerminalShellExecutable({ platform: 'win32' }),
      resolveTerminalShellExecutable({ platform: 'win32' })
    ])
    expect(sharedResults).toEqual([
      { reason: transientFailure, status: 'rejected' },
      { reason: transientFailure, status: 'rejected' }
    ])
    expect(resolverSystem.execFile).toHaveBeenCalledOnce()

    rejectAliasDiscovery(new Error('alias unavailable'))
    await expect(resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
      WINDOWS_POWERSHELL
    )
    expect(resolverSystem.execFile).toHaveBeenCalledTimes(2)
  })

  it('temporarily quarantines a failed automatic pwsh path without changing explicit shells', async () => {
    resolverSystem.existingExecutables.add(PROGRAM_FILES_PWSH.toLowerCase())
    const resolver = getResolverModule() as ResolverModuleWithQuarantine

    await expect(resolver.resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
      PROGRAM_FILES_PWSH
    )

    resolver.quarantineAutomaticWindowsPowerShellExecutable(
      String.raw`C:\PROGRAM FILES\POWERSHELL\7\PWSH.EXE`
    )

    await expect(resolver.resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
      WINDOWS_POWERSHELL
    )
    await expect(
      resolver.resolveTerminalShellExecutable({
        explicitShell: PROGRAM_FILES_PWSH,
        platform: 'win32'
      })
    ).resolves.toBe(PROGRAM_FILES_PWSH)
    await expect(
      resolver.resolveTerminalShellExecutable({ explicitShell: 'cmd.exe', platform: 'win32' })
    ).resolves.toBe('cmd.exe')

    advancePastEveryFiniteCacheTtl()
    await expect(resolver.resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
      PROGRAM_FILES_PWSH
    )
  })

  it.each(['pwsh.exe', String.raw`C:\Windows\System32\cmd.exe`, WINDOWS_POWERSHELL])(
    'ignores non-absolute or non-pwsh quarantine candidate %s',
    async (candidate) => {
      resolverSystem.existingExecutables.add(PROGRAM_FILES_PWSH.toLowerCase())
      const resolver = getResolverModule() as ResolverModuleWithQuarantine

      await expect(resolver.resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
        PROGRAM_FILES_PWSH
      )
      resolver.quarantineAutomaticWindowsPowerShellExecutable(candidate)

      resolverSystem.existingExecutables.clear()
      await expect(resolver.resolveTerminalShellExecutable({ platform: 'win32' })).resolves.toBe(
        PROGRAM_FILES_PWSH
      )
    }
  )
})

function getResolverModule(): ResolverModule {
  return terminalShellResolver
}

function configureDefaultWindowsEnvironment(): void {
  vi.stubEnv('ProgramW6432', PROGRAM_FILES)
  vi.stubEnv('ProgramFiles', '')
  vi.stubEnv('ProgramFiles(x86)', '')
  vi.stubEnv('LOCALAPPDATA', '')
  vi.stubEnv('PATH', '')
  vi.stubEnv('SystemRoot', String.raw`C:\Windows`)
}

function advancePastEveryFiniteCacheTtl(): void {
  resolverSystem.now += CACHE_BOUNDARY_MS
}

function rejectAliasDiscovery(error: Error): void {
  resolverSystem.execFile.mockImplementation((...args: unknown[]) => {
    const callback = args.at(-1)
    if (typeof callback !== 'function') {
      throw new TypeError('expected execFile callback')
    }
    callback(error, '', '')
  })
}
