interface WindowsProviderShimInput {
  readonly commandName: string
  readonly providerId: string
  readonly runtimeExecutable: string
  readonly shimLauncherPath: string
}

export function createWindowsCmdShim(input: WindowsProviderShimInput): string {
  return [
    '@echo off',
    'setlocal',
    `powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0${escapeCmdPath(input.commandName)}.ps1" %*`,
    'exit /b %ERRORLEVEL%',
    ''
  ].join('\r\n')
}

export function createWindowsPowerShellShim(input: WindowsProviderShimInput): string {
  const runtime = escapePowerShell(input.runtimeExecutable)
  const launcher = escapePowerShell(input.shimLauncherPath)
  const provider = escapePowerShell(input.providerId)
  const command = escapePowerShell(input.commandName)
  return [
    '$previousElectronRunAsNode = $env:ELECTRON_RUN_AS_NODE',
    '$previousElectronNoAttachConsole = $env:ELECTRON_NO_ATTACH_CONSOLE',
    '$previousProviderEnvironment = @{}',
    '$planPath = [IO.Path]::GetTempFileName()',
    '$plan = $null',
    '$exitCode = 126',
    'try {',
    "  $env:ELECTRON_RUN_AS_NODE = '1'",
    '  Remove-Item Env:ELECTRON_NO_ATTACH_CONSOLE -ErrorAction SilentlyContinue',
    `  & '${runtime}' '${launcher}' '--prepare-windows' $planPath '${provider}' '${command}' @args`,
    '  if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE } else {',
    '    $plan = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $planPath -Raw)',
    "    if ($null -eq $plan -or [string]::IsNullOrWhiteSpace([string]$plan.executable)) { throw 'Agent launch plan is empty.' }",
    '    foreach ($entry in $plan.environment.PSObject.Properties) {',
    "      $previousProviderEnvironment[$entry.Name] = [Environment]::GetEnvironmentVariable($entry.Name, 'Process')",
    "      [Environment]::SetEnvironmentVariable($entry.Name, [string]$entry.Value, 'Process')",
    '    }',
    '    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue',
    '    Remove-Item Env:ELECTRON_NO_ATTACH_CONSOLE -ErrorAction SilentlyContinue',
    '    $providerExecutable = [string]$plan.executable',
    '    $providerArguments = @($plan.arguments)',
    '    & $providerExecutable @providerArguments',
    '    $exitCode = $LASTEXITCODE',
    '  }',
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '} finally {',
    '  Remove-Item -LiteralPath $planPath -Force -ErrorAction SilentlyContinue',
    '  foreach ($entry in $previousProviderEnvironment.GetEnumerator()) {',
    "    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')",
    '  }',
    '  if ($null -ne $plan) {',
    "    $env:ELECTRON_RUN_AS_NODE = '1'",
    '    Remove-Item Env:ELECTRON_NO_ATTACH_CONSOLE -ErrorAction SilentlyContinue',
    `    $completionArgs = @('${launcher}', '--complete-windows', '${provider}', [string]$plan.invocationId)`,
    '    if ($null -ne $plan.temporaryDirectory) { $completionArgs += [string]$plan.temporaryDirectory }',
    `    & '${runtime}' @completionArgs *> $null`,
    '  }',
    '  if ($null -eq $previousElectronNoAttachConsole) { Remove-Item Env:ELECTRON_NO_ATTACH_CONSOLE -ErrorAction SilentlyContinue } else { $env:ELECTRON_NO_ATTACH_CONSOLE = $previousElectronNoAttachConsole }',
    '  if ($null -eq $previousElectronRunAsNode) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue } else { $env:ELECTRON_RUN_AS_NODE = $previousElectronRunAsNode }',
    '}',
    'exit $exitCode',
    ''
  ].join('\r\n')
}

export function createWindowsHookRelayLauncher(
  runtimeExecutable: string,
  hookRelayPath: string
): string {
  return [
    '@echo off',
    'setlocal',
    'set "ELECTRON_RUN_AS_NODE=1"',
    `"${escapeCmdPath(runtimeExecutable)}" "${escapeCmdPath(hookRelayPath)}" %*`,
    'exit /b %ERRORLEVEL%',
    ''
  ].join('\r\n')
}

function escapeCmdPath(value: string): string {
  return value.replaceAll('"', '""')
}

function escapePowerShell(value: string): string {
  return value.replaceAll("'", "''")
}
