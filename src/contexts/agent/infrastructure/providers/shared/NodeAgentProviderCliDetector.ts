import { execFile } from 'node:child_process'

import type {
  AgentProviderAvailability,
  AgentProviderDetector
} from '../../../application/ports/AgentProviderContribution'

export type AgentProviderCliCommandRunner = (
  executable: string,
  args: readonly string[],
  options: { readonly timeoutMs: number }
) => Promise<{ readonly stderr: string; readonly stdout: string }>

export interface AgentProviderCliProcessInvocation {
  readonly args: readonly string[]
  readonly executable: string
  readonly missingCommandMarker?: string
}

interface NodeAgentProviderCliDetectorOptions {
  readonly executable: string
  readonly installCommand: string
  readonly minimumVersion?: string
  readonly providerId: string
  readonly runCommand?: AgentProviderCliCommandRunner
  readonly versionArgs?: readonly string[]
}

const inspectionTimeoutMs = 2_000

export class NodeAgentProviderCliDetector implements AgentProviderDetector {
  private readonly runCommand: AgentProviderCliCommandRunner

  constructor(private readonly options: NodeAgentProviderCliDetectorOptions) {
    this.runCommand = options.runCommand ?? runAgentProviderCliCommand
  }

  async inspect(): Promise<AgentProviderAvailability> {
    try {
      const result = await this.runCommand(
        this.options.executable,
        this.options.versionArgs ?? ['--version'],
        { timeoutMs: inspectionTimeoutMs }
      )
      const version = `${result.stdout}\n${result.stderr}`.trim()
      if (!version) return this.unavailable('invalid_output')
      if (this.options.minimumVersion) {
        const parsedVersion = readSemanticVersion(version)
        const minimumVersion = readSemanticVersion(this.options.minimumVersion)
        if (!parsedVersion || !minimumVersion) return this.unavailable('invalid_output')
        if (compareSemanticVersions(parsedVersion, minimumVersion) < 0) {
          return {
            installCommand: this.options.installCommand,
            minimumVersion: this.options.minimumVersion,
            providerId: this.options.providerId,
            status: 'upgrade_required',
            version
          }
        }
      }
      return {
        providerId: this.options.providerId,
        status: 'installed',
        version
      }
    } catch (error) {
      const commandError = readCommandError(error)
      if (commandError?.code === 'ENOENT') {
        return {
          installCommand: this.options.installCommand,
          providerId: this.options.providerId,
          reason: 'not_found',
          status: 'missing',
          version: null
        }
      }
      if (commandError?.killed === true || commandError?.code === 'ETIMEDOUT') {
        return this.unavailable('timed_out')
      }
      if (commandError?.code === 'EACCES' || commandError?.code === 'EPERM') {
        return this.unavailable('permission_denied')
      }
      return this.unavailable('command_failed')
    }
  }

  private unavailable(
    reason: Extract<
      AgentProviderAvailability,
      { readonly status: 'temporarily_unavailable' }
    >['reason']
  ): AgentProviderAvailability {
    return {
      providerId: this.options.providerId,
      reason,
      status: 'temporarily_unavailable',
      version: null
    }
  }
}

type SemanticVersion = readonly [major: number, minor: number, patch: number]

function readSemanticVersion(value: string): SemanticVersion | null {
  const match = /(?:^|\D)(\d+)\.(\d+)\.(\d+)(?:\D|$)/.exec(value)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareSemanticVersions(first: SemanticVersion, second: SemanticVersion): number {
  for (let index = 0; index < first.length; index += 1) {
    const difference = first[index]! - second[index]!
    if (difference !== 0) return difference
  }
  return 0
}

function readCommandError(error: unknown): {
  readonly code?: string | number | null
  readonly killed?: boolean
} | null {
  return typeof error === 'object' && error !== null ? error : null
}

function runAgentProviderCliCommand(
  executable: string,
  args: readonly string[],
  options: { readonly timeoutMs: number }
): Promise<{ readonly stderr: string; readonly stdout: string }> {
  const invocation = createAgentProviderCliProcessInvocation(executable, args)
  return new Promise((resolve, reject) => {
    execFile(
      invocation.executable,
      [...invocation.args],
      { timeout: options.timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          if (invocation.missingCommandMarker && stderr.includes(invocation.missingCommandMarker)) {
            reject(Object.assign(error, { code: 'ENOENT' }))
            return
          }
          reject(error)
          return
        }
        resolve({ stderr, stdout })
      }
    )
  })
}

export function createAgentProviderCliProcessInvocation(
  executable: string,
  args: readonly string[],
  runtimePlatform: NodeJS.Platform = process.platform
): AgentProviderCliProcessInvocation {
  if (runtimePlatform !== 'win32') return { args, executable }

  const missingCommandMarker = 'CLEANCODE_PROVIDER_CLI_NOT_FOUND'
  const encodedScript = Buffer.from(
    createWindowsProviderInspectionScript(executable, args, missingCommandMarker),
    'utf16le'
  ).toString('base64')
  return {
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodedScript
    ],
    executable: 'powershell.exe',
    missingCommandMarker
  }
}

function createWindowsProviderInspectionScript(
  executable: string,
  args: readonly string[],
  missingCommandMarker: string
): string {
  const arguments_ = args.map(
    (argument) => `  (Decode-CleancodeProviderValue '${encodeUtf8(argument)}')`
  )
  return [
    '$cleancodeProviderEncoding = [System.Text.Encoding]::UTF8',
    'function Decode-CleancodeProviderValue([string] $value) {',
    '  return $cleancodeProviderEncoding.GetString([System.Convert]::FromBase64String($value))',
    '}',
    `$cleancodeProviderExecutable = Decode-CleancodeProviderValue '${encodeUtf8(executable)}'`,
    '$cleancodeProviderArguments = @(',
    arguments_.join('\n'),
    ')',
    'try {',
    '  & $cleancodeProviderExecutable @cleancodeProviderArguments',
    '  $cleancodeProviderSucceeded = $?',
    '  $cleancodeProviderNativeExitCode = $LASTEXITCODE',
    '  if ($null -ne $cleancodeProviderNativeExitCode) {',
    '    exit [int]$cleancodeProviderNativeExitCode',
    '  }',
    '  if ($cleancodeProviderSucceeded) { exit 0 }',
    '  exit 1',
    '} catch [System.Management.Automation.CommandNotFoundException] {',
    `  [Console]::Error.Write('${missingCommandMarker}')`,
    '  exit 127',
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '  exit 1',
    '}'
  ].join('\n')
}

function encodeUtf8(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}
