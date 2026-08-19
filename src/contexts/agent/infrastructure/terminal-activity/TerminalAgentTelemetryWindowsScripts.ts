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
    `  $request = @{ arguments = @($args); commandName = '${command}'; providerId = '${provider}' }`,
    '  $requestJson = ConvertTo-Json -InputObject $request -Compress -Depth 4',
    '  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)',
    '  [IO.File]::WriteAllText($planPath, $requestJson, $utf8WithoutBom)',
    "  $env:ELECTRON_RUN_AS_NODE = '1'",
    '  Remove-Item Env:ELECTRON_NO_ATTACH_CONSOLE -ErrorAction SilentlyContinue',
    `  $prepareArgumentLine = '"${launcher}" "--prepare-windows" "' + $planPath + '"'`,
    `  $prepareProcess = Start-Process -FilePath '${runtime}' -ArgumentList $prepareArgumentLine -NoNewWindow -PassThru -Wait`,
    '  $prepareExitCode = $prepareProcess.ExitCode',
    "  if ($env:CLEANCODE_AGENT_ACTIVITY_TRACE -eq '1') { Write-Output ('CLEANCODE_PREPARE_RESULT:' + $prepareExitCode + '|' + (Get-Item -LiteralPath $planPath).Length) }",
    '  if ($prepareExitCode -ne 0) { $exitCode = $prepareExitCode } else {',
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
    "    if ($env:CLEANCODE_AGENT_ACTIVITY_TRACE -eq '1') { Write-Output ('CLEANCODE_PROVIDER_PLAN:' + $providerExecutable + '|' + (Test-Path -LiteralPath $providerExecutable) + '|' + $providerArguments.Count + '|' + ($providerArguments -join ',')) }",
    '    & $providerExecutable @providerArguments',
    '    $exitCode = $LASTEXITCODE',
    "    if ($env:CLEANCODE_AGENT_ACTIVITY_TRACE -eq '1') { Write-Output ('CLEANCODE_PROVIDER_NATIVE_EXIT:' + $exitCode) }",
    '  }',
    '} catch {',
    "  if ($env:CLEANCODE_AGENT_ACTIVITY_TRACE -eq '1') { Write-Output ('CLEANCODE_PREPARE_ERROR:' + $_.Exception.Message) }",
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '} finally {',
    '  foreach ($entry in $previousProviderEnvironment.GetEnumerator()) {',
    "    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')",
    '  }',
    '  if ($null -ne $plan) {',
    "    $env:ELECTRON_RUN_AS_NODE = '1'",
    '    Remove-Item Env:ELECTRON_NO_ATTACH_CONSOLE -ErrorAction SilentlyContinue',
    `    $completionArgumentLine = '"${launcher}" "--complete-windows" "' + $planPath + '"'`,
    `    Start-Process -FilePath '${runtime}' -ArgumentList $completionArgumentLine -NoNewWindow -Wait`,
    '  }',
    '  Remove-Item -LiteralPath $planPath -Force -ErrorAction SilentlyContinue',
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
