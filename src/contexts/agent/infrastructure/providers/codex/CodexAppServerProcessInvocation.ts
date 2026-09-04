import type { AgentProviderCliProcessInvocation } from '../shared/NodeAgentProviderCliDetector'

export function createCodexAppServerProcessInvocation(
  executable: string,
  args: readonly string[]
): AgentProviderCliProcessInvocation {
  if (process.platform !== 'win32') return { executable, args }

  const script = [
    'function Decode-CodexValue([string] $value) {',
    '  return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($value))',
    '}',
    `$codexExecutable = Decode-CodexValue '${encode(executable)}'`,
    `$codexNativeArguments = Decode-CodexValue '${encode(args.map(quoteWindowsArgument).join(' '))}'`,
    '$codexArguments = @(',
    ...args.map((argument) => `  (Decode-CodexValue '${encode(argument)}')`),
    ')',
    '$codexCommand = Get-Command -Name $codexExecutable -ErrorAction Stop | Select-Object -First 1',
    '$codexExtension = [System.IO.Path]::GetExtension($codexCommand.Path).ToLowerInvariant()',
    "if ($codexCommand.CommandType -eq 'Application' -and @('.cmd', '.bat') -notcontains $codexExtension) {",
    // Bypass PowerShell's native-command pipeline: inherit the raw JSON-RPC handles and argv.
    '  $codexStart = New-Object System.Diagnostics.ProcessStartInfo',
    '  $codexStart.FileName = $codexCommand.Path',
    '  $codexStart.Arguments = $codexNativeArguments',
    '  $codexStart.WorkingDirectory = (Get-Location).ProviderPath',
    '  $codexStart.UseShellExecute = $false',
    '  $codexStart.CreateNoWindow = $true',
    '  $codexProcess = [System.Diagnostics.Process]::Start($codexStart)',
    '  try {',
    '    $codexProcess.WaitForExit()',
    '    exit $codexProcess.ExitCode',
    '  } finally { $codexProcess.Dispose() }',
    '} else {',
    '  & $codexExecutable @codexArguments',
    '  exit $LASTEXITCODE',
    '}'
  ].join('\n')
  return {
    executable: 'powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')
    ]
  }
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

function quoteWindowsArgument(value: string): string {
  // Windows native argv quoting: escape quotes and double backslashes before a closing quote.
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`
}
