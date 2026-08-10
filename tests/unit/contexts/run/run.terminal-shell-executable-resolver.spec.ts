import { resolveTerminalShellExecutable } from '../../../../src/contexts/run/infrastructure/pty/TerminalShellExecutableResolver'

const WINDOWS_ENVIRONMENT: NodeJS.ProcessEnv = {
  ProgramW6432: String.raw`C:\Program Files`,
  'ProgramFiles(x86)': String.raw`C:\Program Files (x86)`,
  LOCALAPPDATA: String.raw`C:\Users\dev\AppData\Local`,
  SystemRoot: String.raw`C:\Windows`
}
const PROGRAM_FILES_PWSH = String.raw`C:\Program Files\PowerShell\7\pwsh.exe`
const PATH_PWSH = String.raw`D:\Tools\PowerShell\7\pwsh.exe`
const STORE_ALIAS = String.raw`C:\Users\dev\AppData\Local\Microsoft\WindowsApps\pwsh.exe`
const STORE_EXECUTABLE = String.raw`C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.0.0_x64__8wekyb3d8bbwe\pwsh.exe`
const WINDOWS_POWERSHELL = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`

describe('terminal shell executable resolver', () => {
  it('preserves an explicitly selected Windows shell without probing auto candidates', async () => {
    const isRealExecutable = vi.fn(() => true)

    expect(
      await resolveTerminalShellExecutable({
        explicitShell: 'cmd.exe',
        environment: WINDOWS_ENVIRONMENT,
        isRealExecutable,
        platform: 'win32'
      })
    ).toBe('cmd.exe')
    expect(isRealExecutable).not.toHaveBeenCalled()
  })

  it('prefers a real PowerShell 7 executable from Program Files', async () => {
    expect(
      await resolveTerminalShellExecutable({
        environment: WINDOWS_ENVIRONMENT,
        isRealExecutable: (candidate) => candidate === PROGRAM_FILES_PWSH,
        platform: 'win32'
      })
    ).toBe(PROGRAM_FILES_PWSH)
  })

  it('uses a real pwsh.exe from an absolute PATH entry when standard roots miss', async () => {
    const resolveAppExecutionAlias = vi.fn(() => null)

    expect(
      await resolveTerminalShellExecutable({
        environment: {
          ...WINDOWS_ENVIRONMENT,
          Path: [
            'relative-tools',
            String.raw`C:\Users\dev\AppData\Local\Microsoft\WindowsApps`,
            String.raw`D:\Tools\PowerShell\7`
          ].join(';')
        },
        isRealExecutable: (candidate) => candidate === PATH_PWSH,
        platform: 'win32',
        resolveAppExecutionAlias
      })
    ).toBe(PATH_PWSH)
    expect(resolveAppExecutionAlias).not.toHaveBeenCalled()
  })

  it('resolves a Store App Execution Alias asynchronously to its real package executable', async () => {
    const resolveAppExecutionAlias = vi.fn(async (candidate: string) =>
      candidate === STORE_ALIAS ? STORE_EXECUTABLE : null
    )

    expect(
      await resolveTerminalShellExecutable({
        environment: {
          ...WINDOWS_ENVIRONMENT,
          Path: String.raw`C:\Users\dev\AppData\Local\Microsoft\WindowsApps`
        },
        isRealExecutable: (candidate) => candidate === STORE_EXECUTABLE,
        platform: 'win32',
        resolveAppExecutionAlias
      })
    ).toBe(STORE_EXECUTABLE)
    expect(resolveAppExecutionAlias).toHaveBeenCalledOnce()
    expect(resolveAppExecutionAlias).toHaveBeenCalledWith(STORE_ALIAS)
  })

  it('rejects an unresolved Store alias and falls back to inbox Windows PowerShell', async () => {
    expect(
      await resolveTerminalShellExecutable({
        environment: {
          ...WINDOWS_ENVIRONMENT,
          Path: String.raw`C:\Users\dev\AppData\Local\Microsoft\WindowsApps`
        },
        isRealExecutable: (candidate) => candidate === STORE_ALIAS,
        platform: 'win32',
        resolveAppExecutionAlias: () => null
      })
    ).toBe(WINDOWS_POWERSHELL)
  })

  it('falls back to the absolute inbox Windows PowerShell path when pwsh is absent', async () => {
    expect(
      await resolveTerminalShellExecutable({
        environment: WINDOWS_ENVIRONMENT,
        isRealExecutable: () => false,
        platform: 'win32'
      })
    ).toBe(WINDOWS_POWERSHELL)
  })

  it('rejects relative Windows installation roots and keeps the fallback absolute', async () => {
    expect(
      await resolveTerminalShellExecutable({
        environment: {
          ProgramFiles: 'relative-program-files',
          LOCALAPPDATA: 'relative-local-app-data',
          SystemRoot: 'relative-windows'
        },
        isRealExecutable: () => true,
        platform: 'win32'
      })
    ).toBe(WINDOWS_POWERSHELL)
  })

  it('preserves the inherited default shell on non-Windows platforms', async () => {
    expect(
      await resolveTerminalShellExecutable({
        environment: { SHELL: '/bin/zsh' },
        isRealExecutable: () => false,
        platform: 'darwin'
      })
    ).toBe('/bin/zsh')
  })

  it('keeps non-Windows environment variable names case-sensitive', async () => {
    expect(
      await resolveTerminalShellExecutable({
        environment: { shell: '/unexpected/shell' },
        isRealExecutable: () => false,
        platform: 'linux'
      })
    ).toBe('/bin/sh')
  })
})
