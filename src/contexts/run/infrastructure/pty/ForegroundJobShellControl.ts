import { randomUUID } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { platform as getRuntimePlatform, tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  ForegroundJobProcessIdentity,
  LaunchForegroundJobProcessCommand
} from '../../application/ports/TerminalProcessPort'

const markerStart = '\x1eCLEANCODE_JOB:'
const markerEnd = '\x1f'
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
}

export interface ForegroundJobShellControlOptions {
  readonly platform?: NodeJS.Platform
  readonly shellExecutable?: string
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
  const scriptContents =
    shellFamily === 'powershell'
      ? createPowerShellLaunchScript(command, token)
      : createPosixLaunchScript(command, token)
  const scriptDirectory = mkdtempSync(
    join(options.temporaryRoot ?? tmpdir(), 'cleancode-agent-job-')
  )
  const scriptPath = join(
    scriptDirectory,
    shellFamily === 'powershell' ? 'launch.ps1' : 'launch.sh'
  )
  try {
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
  return (
    [
      quotePosixShellWord(control.scriptPath),
      'cleancode_job_status=$?',
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
  token: string
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
    ['#!/bin/sh', `printf '\\036CLEANCODE_JOB:${token}:started\\037'`, `exec ${invocation}`].join(
      '\n'
    ) + '\n'
  )
}

function createPowerShellLaunchScript(
  command: LaunchForegroundJobProcessCommand,
  token: string
): string {
  const environment = Object.entries(command.environment).map(([name, value]) => {
    if (!environmentNamePattern.test(name)) throw new Error(`Invalid environment name: ${name}`)
    return `[Environment]::SetEnvironmentVariable('${name}', (Decode-CleancodeJobValue '${encodePowerShellValue(value)}'), [EnvironmentVariableTarget]::Process)`
  })
  const arguments_ = command.args.map(
    (argument) => `  (Decode-CleancodeJobValue '${encodePowerShellValue(argument)}')`
  )
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
      ...environment,
      '$cleancodeJobExitCode = 130',
      'try {',
      `  [Console]::Write(([char]30) + 'CLEANCODE_JOB:${token}:started' + ([char]31))`,
      '  & $cleancodeJobExecutable @cleancodeJobArguments',
      '  $cleancodeJobSucceeded = $?',
      '  $cleancodeJobNativeExitCode = $LASTEXITCODE',
      '  if ($null -ne $cleancodeJobNativeExitCode) {',
      '    $cleancodeJobExitCode = [int]$cleancodeJobNativeExitCode',
      '  } elseif ($cleancodeJobSucceeded) {',
      '    $cleancodeJobExitCode = 0',
      '  } else {',
      '    $cleancodeJobExitCode = 1',
      '  }',
      '} catch {',
      '  $cleancodeJobExitCode = 1',
      '  [Console]::Error.WriteLine($_.Exception.Message)',
      '} finally {',
      `  [Console]::Write(([char]30) + 'CLEANCODE_JOB:${token}:exit:' + [string]$cleancodeJobExitCode + ([char]31))`,
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
