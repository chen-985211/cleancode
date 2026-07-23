import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'

import type {
  AgentProviderAvailability,
  AgentProviderDetector
} from '../../../application/ports/AgentProviderContribution'

export type FindAgentProviderExecutable = (executable: string) => Promise<string | null>

interface NodeAgentProviderCommandDetectorOptions {
  readonly executable: string
  readonly findExecutable?: FindAgentProviderExecutable
  readonly installCommand?: string
  readonly providerId: string
}

export class NodeAgentProviderCommandDetector implements AgentProviderDetector {
  private readonly findExecutable: FindAgentProviderExecutable

  constructor(private readonly options: NodeAgentProviderCommandDetectorOptions) {
    this.findExecutable = options.findExecutable ?? findExecutableOnPath
  }

  async inspect(): Promise<AgentProviderAvailability> {
    try {
      const executablePath = await this.findExecutable(this.options.executable)
      if (executablePath) {
        return {
          providerId: this.options.providerId,
          status: 'installed',
          version: 'available'
        }
      }
      return {
        ...(this.options.installCommand
          ? { installCommand: this.options.installCommand }
          : undefined),
        providerId: this.options.providerId,
        reason: 'not_found',
        status: 'missing',
        version: null
      }
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      return {
        providerId: this.options.providerId,
        reason: code === 'EACCES' || code === 'EPERM' ? 'permission_denied' : 'command_failed',
        status: 'temporarily_unavailable',
        version: null
      }
    }
  }
}

async function findExecutableOnPath(
  executable: string,
  environment: NodeJS.ProcessEnv = process.env,
  runtimePlatform: NodeJS.Platform = process.platform
): Promise<string | null> {
  const candidates = isAbsolute(executable)
    ? [executable]
    : (environment.PATH ?? '')
        .split(delimiter)
        .filter(Boolean)
        .flatMap((directory) =>
          executableCandidates(join(directory, executable), environment, runtimePlatform)
        )

  for (const candidate of candidates) {
    try {
      await access(candidate, runtimePlatform === 'win32' ? constants.F_OK : constants.X_OK)
      return candidate
    } catch {
      // Continue scanning the hydrated PATH.
    }
  }
  return null
}

function executableCandidates(
  candidate: string,
  environment: NodeJS.ProcessEnv,
  runtimePlatform: NodeJS.Platform
): readonly string[] {
  if (runtimePlatform !== 'win32') return [candidate]
  const extensions = (environment.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  return [candidate, ...extensions.map((extension) => `${candidate}${extension.toLowerCase()}`)]
}
