import { randomUUID } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { platform as getRuntimePlatform, tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  ForegroundJobProcessIdentity,
  LaunchForegroundJobProcessCommand
} from '../../application/ports/TerminalProcessPort'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'
import { createPowerShellConsoleThemeScript } from './PowerShellConsoleTheme'
import { getPowerShellUtf8Bootstrap } from './PowerShellUtf8Bootstrap'

const posixMarkerStart = '\x1eCLEANCODE_JOB:'
const posixMarkerEnd = '\x1f'
const powershellMarkerStart = '\x1b]633;CLEANCODE_JOB:'
const powershellMarkerEnd = '\x07'
const environmentNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface ForegroundJobShellControl {
  readonly token: string
  readonly command: LaunchForegroundJobProcessCommand
  buffer: string
  outputPhase: 'awaiting_started' | 'running'
  readonly shellExecutable: string
  readonly shellFamily: 'posix' | 'powershell'
  readonly scriptDirectory: string
  readonly scriptPath: string
  readonly statusPath: string | null
}

export interface ForegroundJobShellControlOptions {
  readonly platform?: NodeJS.Platform
  readonly shellExecutable?: string
  readonly terminalSourceTheme?: TerminalSourceTheme
  readonly temporaryRoot?: string
  readonly token?: string
}

export function createForegroundJobShellControl(
  command: LaunchForegroundJobProcessCommand,
  options: ForegroundJobShellControlOptions = {}
): ForegroundJobShellControl {
  const runtimePlatform = options.platform ?? getRuntimePlatform()
  const shellFamily = runtimePlatform === 'win32' ? 'powershell' : 'posix'
  const shellExecutable = options.shellExecutable ?? defaultShellExecutable(shellFamily)
  if (!supportsForegroundJobShell(runtimePlatform, shellExecutable)) {
    throw new Error('Windows foreground jobs require PowerShell or PowerShell Core.')
  }
  const token = options.token ?? randomUUID().replaceAll('-', '')
  if (!/^[A-Za-z0-9]+$/.test(token)) throw new Error('Invalid foreground job token.')
  const scriptDirectory = mkdtempSync(
    join(options.temporaryRoot ?? tmpdir(), 'cleancode-agent-job-')
  )
  const statusPath = shellFamily === 'posix' ? join(scriptDirectory, 'exit-status') : null
  const scriptPath = join(
    scriptDirectory,
    shellFamily === 'powershell' ? 'launch.ps1' : 'launch.sh'
  )
  try {
    const scriptContents =
      shellFamily === 'powershell'
        ? createPowerShellLaunchScript(command, token, options.terminalSourceTheme ?? 'dark')
        : createPosixLaunchScript(command, token, statusPath as string)
    writeFileSync(scriptPath, scriptContents, { encoding: 'utf8', mode: 0o700 })
    if (shellFamily === 'posix') chmodSync(scriptPath, 0o700)
  } catch (error) {
    rmSync(scriptDirectory, { force: true, recursive: true })
    throw error
  }
  return {
    buffer: '',
    command,
    outputPhase: 'awaiting_started',
    shellExecutable,
    shellFamily,
    scriptDirectory,
    scriptPath,
    statusPath,
    token
  }
}

export function createForegroundJobProbe(control: ForegroundJobShellControl): string {
  if (control.shellFamily === 'powershell') {
    return (
      [
        '&',
        quotePowerShellWord(control.shellExecutable),
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy Bypass',
        '-File',
        quotePowerShellWord(control.scriptPath)
      ].join(' ') + '\r'
    )
  }
  if (!control.statusPath) throw new Error('POSIX foreground job status path is unavailable.')
  return (
    [
      quotePosixShellWord(control.scriptPath),
      `IFS= read -r cleancode_job_status < ${quotePosixShellWord(control.statusPath)}`,
      `printf '\\036CLEANCODE_JOB:${control.token}:exit:%s\\037' "$cleancode_job_status"`
    ].join('; ') + '\n'
  )
}

export function disposeForegroundJobShellControl(control: ForegroundJobShellControl): void {
  rmSync(control.scriptDirectory, { force: true, maxRetries: 5, recursive: true, retryDelay: 20 })
}

export function supportsForegroundJobShell(
  runtimePlatform: NodeJS.Platform,
  shellExecutable: string
): boolean {
  if (runtimePlatform !== 'win32') return true
  const shellName = shellExecutable
    .replaceAll('\\', '/')
    .split('/')
    .pop()
    ?.toLowerCase()
    .replace(/\.exe$/, '')
  return shellName === 'powershell' || shellName === 'pwsh'
}

function createPosixLaunchScript(
  command: LaunchForegroundJobProcessCommand,
  token: string,
  statusPath: string
): string {
  const environment = Object.entries(command.environment).map(([name, value]) => {
    if (!environmentNamePattern.test(name)) throw new Error(`Invalid environment name: ${name}`)
    return quotePosixShellWord(`${name}=${value}`)
  })
  const invocation = [
    'env',
    ...environment,
    quotePosixShellWord(command.executable),
    ...command.args.map(quotePosixShellWord)
  ].join(' ')
  return (
    [
      '#!/bin/sh',
      "trap ':' INT",
      `printf '\\036CLEANCODE_JOB:${token}:started\\037'`,
      invocation,
      'cleancode_job_status=$?',
      `printf '%s\\n' "$cleancode_job_status" > ${quotePosixShellWord(statusPath)}`,
      'exit 0'
    ].join('\n') + '\n'
  )
}

function createPowerShellLaunchScript(
  command: LaunchForegroundJobProcessCommand,
  token: string,
  terminalSourceTheme: TerminalSourceTheme
): string {
  const environment = Object.entries(command.environment).map(([name, value]) => {
    if (!environmentNamePattern.test(name)) throw new Error(`Invalid environment name: ${name}`)
    return `[Environment]::SetEnvironmentVariable('${name}', (Decode-CleancodeJobValue '${encodePowerShellValue(value)}'), [EnvironmentVariableTarget]::Process)`
  })
  const arguments_ = command.args.map(
    (argument) => `  (Decode-CleancodeJobValue '${encodePowerShellValue(argument)}')`
  )
  const nativeArguments = encodePowerShellValue(createWindowsProcessArguments(command.args))
  return (
    [
      '$cleancodeJobEncoding = [System.Text.Encoding]::UTF8',
      'function Decode-CleancodeJobValue([string] $value) {',
      '  return $cleancodeJobEncoding.GetString([System.Convert]::FromBase64String($value))',
      '}',
      `$cleancodeJobExecutable = Decode-CleancodeJobValue '${encodePowerShellValue(command.executable)}'`,
      '$cleancodeJobArguments = @(',
      arguments_.join('\n'),
      ')',
      `$cleancodeJobNativeArguments = Decode-CleancodeJobValue '${nativeArguments}'`,
      ...environment,
      '$cleancodeJobExitCode = 130',
      'try {',
      ...getPowerShellUtf8Bootstrap()
        .split('\n')
        .map((line) => `  ${line}`),
      ...createPowerShellConsoleThemeScript(terminalSourceTheme)
        .split('\n')
        .map((line) => `  ${line}`),
      `  [Console]::Write(([char]27) + ']633;CLEANCODE_JOB:${token}:started' + ([char]7))`,
      '  $cleancodeJobCommand = Get-Command -Name $cleancodeJobExecutable -ErrorAction Stop | Select-Object -First 1',
      '  $cleancodeJobInvocation = $cleancodeJobCommand.Path',
      '  $cleancodeJobUsesPowerShellShim = $false',
      '  $cleancodeJobExtension = [System.IO.Path]::GetExtension($cleancodeJobCommand.Path).ToLowerInvariant()',
      "  if ($cleancodeJobExtension -eq '.cmd') {",
      "    $cleancodeJobPowerShellShim = [System.IO.Path]::ChangeExtension($cleancodeJobCommand.Path, '.ps1')",
      '    if (Test-Path -LiteralPath $cleancodeJobPowerShellShim -PathType Leaf) {',
      '      $cleancodeJobInvocation = $cleancodeJobPowerShellShim',
      '      $cleancodeJobUsesPowerShellShim = $true',
      '    }',
      '  }',
      "  $cleancodeJobIsNativeApplication = (-not $cleancodeJobUsesPowerShellShim) -and ([string]$cleancodeJobCommand.CommandType -eq 'Application') -and (@('.cmd', '.bat') -notcontains $cleancodeJobExtension)",
      '  if ($cleancodeJobIsNativeApplication) {',
      '    $cleancodeJobStartInfo = New-Object System.Diagnostics.ProcessStartInfo',
      '    $cleancodeJobStartInfo.FileName = $cleancodeJobCommand.Path',
      '    $cleancodeJobStartInfo.UseShellExecute = $false',
      '    $cleancodeJobStartInfo.Arguments = $cleancodeJobNativeArguments',
      '    $cleancodeJobProcess = New-Object System.Diagnostics.Process',
      '    $cleancodeJobProcess.StartInfo = $cleancodeJobStartInfo',
      '    if (-not $cleancodeJobProcess.Start()) {',
      "      throw 'Unable to start the foreground job process.'",
      '    }',
      '    $cleancodeJobProcess.WaitForExit()',
      '    $cleancodeJobExitCode = [int]$cleancodeJobProcess.ExitCode',
      '    $cleancodeJobProcess.Dispose()',
      '  } else {',
      '    $global:LASTEXITCODE = $null',
      '    & $cleancodeJobInvocation @cleancodeJobArguments',
      '    $cleancodeJobSucceeded = $?',
      '    $cleancodeJobNativeExitCode = $LASTEXITCODE',
      '    if ($null -ne $cleancodeJobNativeExitCode) {',
      '      $cleancodeJobExitCode = [int]$cleancodeJobNativeExitCode',
      '    } elseif ($cleancodeJobSucceeded) {',
      '      $cleancodeJobExitCode = 0',
      '    } else {',
      '      $cleancodeJobExitCode = 1',
      '    }',
      '  }',
      '} catch {',
      '  $cleancodeJobExitCode = 1',
      '  [Console]::Error.WriteLine($_.Exception.Message)',
      '} finally {',
      `  [Console]::Write(([char]27) + ']633;CLEANCODE_JOB:${token}:exit:' + [string]$cleancodeJobExitCode + ([char]7))`,
      '}',
      'exit $cleancodeJobExitCode'
    ].join('\n') + '\n'
  )
}

function defaultShellExecutable(shellFamily: ForegroundJobShellControl['shellFamily']): string {
  return shellFamily === 'powershell' ? 'powershell.exe' : process.env.SHELL || '/bin/sh'
}

function encodePowerShellValue(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

export function createWindowsProcessArguments(args: readonly string[]): string {
  return args.map(quoteWindowsProcessArgument).join(' ')
}

function quoteWindowsProcessArgument(value: string): string {
  if (value && !/[\s"]/.test(value)) return value

  let quoted = '"'
  let backslashCount = 0

  for (const character of value) {
    if (character === '\\') {
      backslashCount += 1
      continue
    }
    if (character === '"') {
      quoted += `${'\\'.repeat(backslashCount * 2 + 1)}"`
      backslashCount = 0
      continue
    }
    quoted += `${'\\'.repeat(backslashCount)}${character}`
    backslashCount = 0
  }

  return `${quoted}${'\\'.repeat(backslashCount * 2)}"`
}

export function acceptForegroundJobOutput(
  control: ForegroundJobShellControl,
  data: string,
  handlers: {
    readonly onStarted: (identity: ForegroundJobProcessIdentity) => void
    readonly onExit: (
      event: ForegroundJobProcessIdentity & { readonly exitCode: number | null }
    ) => void
  }
): string {
  control.buffer += data
  const markerStart =
    control.shellFamily === 'powershell' ? powershellMarkerStart : posixMarkerStart
  const markerEnd = control.shellFamily === 'powershell' ? powershellMarkerEnd : posixMarkerEnd
  const exactPrefix = `${markerStart}${control.token}:`
  let output = ''

  while (control.buffer) {
    const markerIndex = control.buffer.indexOf(exactPrefix)
    if (markerIndex < 0) {
      const retainedLength = longestSuffixPrefix(control.buffer, exactPrefix)
      if (control.outputPhase === 'running') {
        output += control.buffer.slice(0, control.buffer.length - retainedLength)
      }
      control.buffer = control.buffer.slice(control.buffer.length - retainedLength)
      break
    }
    if (control.outputPhase === 'running') {
      output += control.buffer.slice(0, markerIndex)
    }
    const endIndex = control.buffer.indexOf(markerEnd, markerIndex + exactPrefix.length)
    if (endIndex < 0) {
      control.buffer = control.buffer.slice(markerIndex)
      break
    }
    const payload = control.buffer.slice(markerIndex + exactPrefix.length, endIndex)
    control.buffer = control.buffer.slice(endIndex + markerEnd.length)
    if (payload === 'started' && control.outputPhase === 'awaiting_started') {
      control.outputPhase = 'running'
      handlers.onStarted(control.command)
    } else if (payload.startsWith('exit:')) {
      const exitCode = Number.parseInt(payload.slice('exit:'.length), 10)
      control.outputPhase = 'running'
      handlers.onExit({
        ...control.command,
        exitCode: Number.isInteger(exitCode) ? exitCode : null
      })
    }
  }
  return output
}

function longestSuffixPrefix(value: string, prefix: string): number {
  const maximum = Math.min(value.length, prefix.length - 1)
  for (let length = maximum; length > 0; length -= 1) {
    if (value.endsWith(prefix.slice(0, length))) return length
  }
  return 0
}

function quotePosixShellWord(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function quotePowerShellWord(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
