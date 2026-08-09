import { createTerminalProcessLaunch } from '../../../../src/contexts/run/infrastructure/pty/TerminalShellCommand'

describe('terminal shell command', () => {
  it.each(['powershell.exe', String.raw`C:\Program Files\PowerShell\7\pwsh.exe`])(
    'starts an ordinary Windows PowerShell shell without a logo and keeps it open: %s',
    (shell) => {
      const launch = createTerminalProcessLaunch(shell, undefined, 'command', 'win32')

      expect(launch).toEqual({
        executable: shell,
        arguments: ['-NoLogo', '-NoExit']
      })
      expect(launch.arguments).not.toContain('-NoProfile')
    }
  )

  it('does not add Windows PowerShell startup arguments on a non-Windows platform', () => {
    expect(createTerminalProcessLaunch('pwsh', undefined, 'command', 'darwin')).toEqual({
      executable: 'pwsh',
      arguments: []
    })
  })

  it('keeps a finite Windows PowerShell command finite', () => {
    expect(
      createTerminalProcessLaunch('powershell.exe', "Write-Output 'done'", 'command', 'win32')
    ).toEqual({
      executable: 'powershell.exe',
      arguments: ['-NoLogo', '-Command', "Write-Output 'done'"]
    })
  })

  it('keeps an interactive Windows PowerShell launch open after its command', () => {
    expect(
      createTerminalProcessLaunch('pwsh.exe', "Write-Output 'ready'", 'interactive', 'win32')
    ).toEqual({
      executable: 'pwsh.exe',
      arguments: ['-NoLogo', '-NoExit', '-Command', "Write-Output 'ready'"]
    })
  })
})
