import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'
import { createPowerShellConsoleThemeScript } from './PowerShellConsoleTheme'

// Preserve margin below CreateProcess' 32,767-character command-line boundary.
const encodedCommandLengthLimit = 28_000
const powerShellUtf8Bootstrap = [
  'if ($ExecutionContext.SessionState.LanguageMode -eq "FullLanguage") {',
  '  try {',
  '    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
  '    [Console]::InputEncoding = [System.Text.UTF8Encoding]::new()',
  '    $OutputEncoding = [Console]::OutputEncoding',
  '  } catch {',
  '    # Encoding setup is best-effort and must not block the shell.',
  '  }',
  '}'
].join('\n')

export function getPowerShellUtf8Bootstrap(): string {
  return powerShellUtf8Bootstrap
}

export function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

export function createWindowsPowerShellLaunchArguments(
  command: string | undefined,
  keepOpen: boolean,
  terminalSourceTheme: TerminalSourceTheme = 'dark'
): readonly string[] {
  const prefix = keepOpen ? ['-NoLogo', '-NoExit'] : ['-NoLogo']
  const terminalBootstrap = createPowerShellTerminalBootstrap(terminalSourceTheme)
  if (command === undefined) {
    return [...prefix, '-EncodedCommand', encodePowerShellCommand(terminalBootstrap)]
  }

  const startupScript = createPowerShellStartupScript(command, terminalBootstrap)
  const encodedCommand = encodePowerShellCommand(startupScript)
  if (encodedCommand.length <= encodedCommandLengthLimit) {
    return [...prefix, '-EncodedCommand', encodedCommand]
  }
  return [...prefix, '-Command', command]
}

function createPowerShellTerminalBootstrap(terminalSourceTheme: TerminalSourceTheme): string {
  return [powerShellUtf8Bootstrap, createPowerShellConsoleThemeScript(terminalSourceTheme)].join(
    '\n'
  )
}

function createPowerShellStartupScript(command: string, terminalBootstrap: string): string {
  // Invoke-Expression parses the user's source independently, so leading
  // using/param declarations stay valid and execution remains in local scope.
  // Unlike ScriptBlock.Create, the built-in cmdlet remains usable in
  // ConstrainedLanguage sessions enforced by AppLocker or App Control.
  const invocation = `Microsoft.PowerShell.Utility\\Invoke-Expression -Command ${quotePowerShellString(command)}`
  return `${terminalBootstrap}\n${invocation}`
}

function quotePowerShellString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
