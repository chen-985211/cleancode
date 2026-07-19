import { execFile } from 'node:child_process'

import {
  codexCliInstallCommand,
  type CodexCliInstallationSnapshot,
  type CodexCliPort
} from '../../application/ports/CodexCliPort'

export type CodexCliCommandRunner = (
  executable: string,
  args: readonly string[],
  options: { readonly timeoutMs: number }
) => Promise<{ readonly stdout: string }>

const codexCliInspectionTimeoutMs = 2_000

export class NodeCodexCliAdapter implements CodexCliPort {
  constructor(private readonly runCommand: CodexCliCommandRunner = runCodexCliCommand) {}

  async inspect(): Promise<CodexCliInstallationSnapshot> {
    try {
      const result = await this.runCommand('codex', ['--version'], {
        timeoutMs: codexCliInspectionTimeoutMs
      })
      const version = normalizeCodexCliVersionOutput(result.stdout)

      return version
        ? {
            status: 'installed',
            version
          }
        : createUnavailableCodexCliSnapshot('invalid_output')
    } catch (error) {
      return classifyCodexCliInspectionError(error)
    }
  }
}

function normalizeCodexCliVersionOutput(output: string): string | null {
  const version = output.trim()

  return version.length > 0 ? version : null
}

function createMissingCodexCliSnapshot(): CodexCliInstallationSnapshot {
  return {
    installCommand: codexCliInstallCommand,
    reason: 'not_found',
    status: 'missing',
    version: null
  }
}

function createUnavailableCodexCliSnapshot(
  reason: Extract<
    CodexCliInstallationSnapshot,
    { readonly status: 'temporarily_unavailable' }
  >['reason']
): CodexCliInstallationSnapshot {
  return {
    reason,
    status: 'temporarily_unavailable',
    version: null
  }
}

function classifyCodexCliInspectionError(error: unknown): CodexCliInstallationSnapshot {
  const commandError = readCommandError(error)

  if (commandError?.code === 'ENOENT') {
    return createMissingCodexCliSnapshot()
  }

  if (commandError?.killed === true || commandError?.code === 'ETIMEDOUT') {
    return createUnavailableCodexCliSnapshot('timed_out')
  }

  if (commandError?.code === 'EACCES' || commandError?.code === 'EPERM') {
    return createUnavailableCodexCliSnapshot('permission_denied')
  }

  return createUnavailableCodexCliSnapshot('command_failed')
}

function readCommandError(error: unknown): {
  readonly code?: string | number | null
  readonly killed?: boolean
} | null {
  return typeof error === 'object' && error !== null ? error : null
}

function runCodexCliCommand(
  executable: string,
  args: readonly string[],
  options: { readonly timeoutMs: number }
): Promise<{ readonly stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(executable, [...args], { timeout: options.timeoutMs }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }

      resolve({ stdout })
    })
  })
}
