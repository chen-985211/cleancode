import { createTerminalProcessLaunch } from '../../../../src/contexts/run/infrastructure/pty/TerminalShellCommand'
import { windowsAgentShellReadyCommand } from '../../../../src/contexts/run/infrastructure/pty/WindowsAgentShellReadiness'

describe('terminal shell command', () => {
  it.each(['powershell.exe', String.raw`C:\Program Files\PowerShell\7\pwsh.exe`])(
    'starts an ordinary Windows PowerShell shell with UTF-8 after normal Profile loading: %s',
    (shell) => {
      const launch = createTerminalProcessLaunch(shell, undefined, 'command', 'win32')
      const script = decodePowerShellCommand(launch.arguments)

      expect(launch.executable).toBe(shell)
      expect(launch.arguments.slice(0, 3)).toEqual(['-NoLogo', '-NoExit', '-EncodedCommand'])
      expect(launch.arguments).not.toContain('-NoProfile')
      expect(script).toContain('[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()')
      expect(script).toContain('[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()')
      expect(script).toContain('$OutputEncoding = [Console]::OutputEncoding')
      expect(script).not.toContain('$PROFILE')
    }
  )

  it('does not add Windows PowerShell startup arguments on a non-Windows platform', () => {
    expect(createTerminalProcessLaunch('pwsh', undefined, 'command', 'darwin')).toEqual({
      executable: 'pwsh',
      arguments: []
    })
  })

  it('keeps non-Windows PowerShell interactive command arguments unchanged', () => {
    expect(
      createTerminalProcessLaunch('pwsh', 'Write-Output ready', 'interactive', 'linux')
    ).toEqual({
      executable: 'pwsh',
      arguments: ['-NoLogo', '-NoExit', '-Command', 'Write-Output ready']
    })
  })

  it('keeps a finite Windows PowerShell command finite', () => {
    const launch = createTerminalProcessLaunch(
      'powershell.exe',
      "Write-Output 'done'",
      'command',
      'win32'
    )
    const script = decodePowerShellCommand(launch.arguments)

    expect(launch.executable).toBe('powershell.exe')
    expect(launch.arguments.slice(0, 2)).toEqual(['-NoLogo', '-EncodedCommand'])
    expect(launch.arguments).not.toContain('-NoExit')
    expect(script.indexOf('[Console]::OutputEncoding')).toBeLessThan(
      script.indexOf('Microsoft.PowerShell.Utility\\Invoke-Expression')
    )
    expect(decodePowerShellStartupCommand(script)).toBe("Write-Output 'done'")
  })

  it('keeps an interactive Windows PowerShell launch open after its command', () => {
    const launch = createTerminalProcessLaunch(
      'pwsh.exe',
      "Write-Output 'ready'",
      'interactive',
      'win32'
    )

    expect(launch.executable).toBe('pwsh.exe')
    expect(launch.arguments.slice(0, 3)).toEqual(['-NoLogo', '-NoExit', '-EncodedCommand'])
    expect(decodePowerShellStartupCommand(decodePowerShellCommand(launch.arguments))).toBe(
      "Write-Output 'ready'"
    )
  })

  it('preserves Unicode and nested PowerShell startup command text through EncodedCommand', () => {
    const command = `$value = '中文🙂'; Write-Output "$value 'nested'"`
    const launch = createTerminalProcessLaunch('powershell.exe', command, 'command', 'win32')

    expect(decodePowerShellStartupCommand(decodePowerShellCommand(launch.arguments))).toBe(command)
  })

  it('initializes UTF-8 before the Windows Agent readiness marker', () => {
    const launch = createTerminalProcessLaunch(
      'powershell.exe',
      windowsAgentShellReadyCommand,
      'interactive',
      'win32'
    )
    const script = decodePowerShellCommand(launch.arguments)

    expect(script.indexOf('[Console]::OutputEncoding')).toBeLessThan(
      script.indexOf('Microsoft.PowerShell.Utility\\Invoke-Expression')
    )
    expect(decodePowerShellStartupCommand(script)).toBe(windowsAgentShellReadyCommand)
  })
})

function decodePowerShellCommand(arguments_: readonly string[]): string {
  const encodedCommandIndex = arguments_.indexOf('-EncodedCommand')
  expect(encodedCommandIndex).toBeGreaterThan(-1)
  return Buffer.from(arguments_[encodedCommandIndex + 1] ?? '', 'base64').toString('utf16le')
}

function decodePowerShellStartupCommand(startupScript: string): string {
  const quotedCommand = startupScript.match(
    /Microsoft\.PowerShell\.Utility\\Invoke-Expression -Command '([\s\S]*)'$/u
  )?.[1]
  expect(quotedCommand).toBeDefined()
  return (quotedCommand ?? '').replaceAll("''", "'")
}
