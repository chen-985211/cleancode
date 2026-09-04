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
    // Explicitly forward pipes: a windowless .NET child does not inherit Node's stdio reliably.
    `  Add-Type -TypeDefinition (Decode-CodexValue '${encode(windowsPipeBridge)}')`,
    '  $codexStart = New-Object System.Diagnostics.ProcessStartInfo',
    '  $codexStart.FileName = $codexCommand.Path',
    '  $codexStart.Arguments = $codexNativeArguments',
    '  $codexStart.WorkingDirectory = (Get-Location).ProviderPath',
    '  $codexStart.UseShellExecute = $false',
    '  $codexStart.CreateNoWindow = $true',
    '  $codexStart.RedirectStandardInput = $true',
    '  $codexStart.RedirectStandardOutput = $true',
    '  $codexStart.RedirectStandardError = $true',
    '  exit [CleanCodeCodexQueryPipes]::Run($codexStart)',
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

const windowsPipeBridge = `
using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

public static class CleanCodeCodexQueryPipes {
  public static int Run(ProcessStartInfo start) {
    using (var child = Process.Start(start)) {
      var input = CopyInput(Console.OpenStandardInput(), child.StandardInput.BaseStream);
      var output = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
      var error = child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
      child.WaitForExit();
      Task.WaitAll(output, error);
      return child.ExitCode;
    }
  }

  private static async Task CopyInput(Stream source, Stream destination) {
    try { await source.CopyToAsync(destination); }
    catch (IOException) { }
    catch (ObjectDisposedException) { }
    finally { destination.Dispose(); }
  }
}
`

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

function quoteWindowsArgument(value: string): string {
  // Windows native argv quoting: escape quotes and double backslashes before a closing quote.
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`
}
