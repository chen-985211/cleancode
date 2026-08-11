import { spawn } from 'node:child_process'
import { posix, win32 } from 'node:path'

import type {
  AgentProviderDetectionEnvironmentPort,
  PrepareAgentProviderDetectionEnvironmentOptions
} from '../../../application/ports/AgentProviderDetectionEnvironmentPort'

const shellPathSentinel = '__CLEANCODE_AGENT_SHELL_PATH__'
const defaultTimeoutMs = 5_000
const ansiEscapeSequence = /\x1b\[[0-9;?]*[A-Za-z]/g // eslint-disable-line no-control-regex

interface AgentProviderShellPathProbeHandle {
  cancel(): void
  readonly output: Promise<string>
}

export type AgentProviderShellPathProbe = (
  shell: string,
  command: {
    readonly args: readonly string[]
    readonly environment: NodeJS.ProcessEnv
  }
) => AgentProviderShellPathProbeHandle

interface NodeAgentProviderShellPathHydratorOptions {
  readonly environment?: NodeJS.ProcessEnv
  readonly platform: NodeJS.Platform
  readonly probe?: AgentProviderShellPathProbe
  readonly timeoutMs?: number
}

interface CachedHydration {
  pending: boolean
  readonly promise: Promise<void>
}

export class NodeAgentProviderShellPathHydrator implements AgentProviderDetectionEnvironmentPort {
  private readonly environment: NodeJS.ProcessEnv
  private readonly pathDelimiter: string
  private readonly platform: NodeJS.Platform
  private readonly probe: AgentProviderShellPathProbe
  private readonly timeoutMs: number
  private hydration: CachedHydration | null = null

  constructor(options: NodeAgentProviderShellPathHydratorOptions) {
    this.environment = options.environment ?? process.env
    this.pathDelimiter = options.platform === 'win32' ? win32.delimiter : posix.delimiter
    this.platform = options.platform
    this.probe = options.probe ?? startShellPathProbe
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs
  }

  prepare(options: PrepareAgentProviderDetectionEnvironmentOptions = {}): Promise<void> {
    const cached = this.hydration
    if (cached && (!options.refresh || cached.pending)) return cached.promise

    const entry: CachedHydration = {
      pending: true,
      promise: this.hydrate()
    }
    this.hydration = entry
    void entry.promise.then(() => {
      if (this.hydration === entry) entry.pending = false
    })
    return entry.promise
  }

  private async hydrate(): Promise<void> {
    if (this.platform === 'win32') return
    const shell = this.environment.SHELL || (this.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
    const command = [
      `printf '%s' '${shellPathSentinel}'`,
      `printf '%s' "$PATH"`,
      `printf '%s' '${shellPathSentinel}'`
    ].join('; ')
    let handle: AgentProviderShellPathProbeHandle
    try {
      handle = this.probe(shell, {
        args: ['-ilc', command],
        environment: this.environment
      })
    } catch {
      return
    }

    const output = await readProbeOutput(handle, this.timeoutMs)
    if (output === null) return
    const segments = parseCapturedShellPath(output, this.pathDelimiter)
    if (segments.length > 0) {
      mergeShellPathSegments(this.environment, segments, this.pathDelimiter)
    }
  }
}

function readProbeOutput(
  handle: AgentProviderShellPathProbeHandle,
  timeoutMs: number
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (output: string | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(output)
    }
    const timer = setTimeout(() => {
      try {
        handle.cancel()
      } catch {
        // The inherited PATH remains the safe fallback if the shell cannot be stopped.
      }
      finish(null)
    }, timeoutMs)
    void handle.output.then(
      (output) => finish(output),
      () => finish(null)
    )
  })
}

function parseCapturedShellPath(output: string, pathDelimiter: string): readonly string[] {
  const cleaned = output.replace(ansiEscapeSequence, '')
  const start = cleaned.indexOf(shellPathSentinel)
  if (start < 0) return []
  const valueStart = start + shellPathSentinel.length
  const end = cleaned.indexOf(shellPathSentinel, valueStart)
  if (end < 0) return []
  const value = cleaned.slice(valueStart, end).trim()
  if (!value) return []
  return [
    ...new Set(
      value
        .split(pathDelimiter)
        .map((segment) => segment.trim())
        .filter(Boolean)
    )
  ]
}

function mergeShellPathSegments(
  environment: NodeJS.ProcessEnv,
  shellSegments: readonly string[],
  pathDelimiter: string
): void {
  const inheritedSegments = (environment.PATH ?? '').split(pathDelimiter).filter(Boolean)
  const preferredSegments = [...new Set(shellSegments)]
  const preferred = new Set(preferredSegments)
  environment.PATH = [
    ...preferredSegments,
    ...inheritedSegments.filter((segment) => !preferred.has(segment))
  ].join(pathDelimiter)
}

function startShellPathProbe(
  shell: string,
  command: {
    readonly args: readonly string[]
    readonly environment: NodeJS.ProcessEnv
  }
): AgentProviderShellPathProbeHandle {
  const child = spawn(shell, [...command.args], {
    detached: false,
    env: command.environment,
    stdio: ['ignore', 'pipe', 'ignore']
  })
  let output = ''

  return {
    cancel: () => child.kill('SIGKILL'),
    output: new Promise<string>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8')
      })
      child.once('error', reject)
      child.once('close', () => resolve(output))
    })
  }
}
