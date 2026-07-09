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
            installCommand: codexCliInstallCommand,
            status: 'installed',
            version
          }
        : createMissingCodexCliSnapshot()
    } catch {
      return createMissingCodexCliSnapshot()
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
    status: 'missing',
    version: null
  }
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
