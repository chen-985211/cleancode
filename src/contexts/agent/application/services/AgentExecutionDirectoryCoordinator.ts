import type { AgentExecutionDirectoryPort } from '../ports/AgentExecutionDirectoryPort'
import type { ManagedAgentSession } from '../use-cases/AgentSessionRuntimeState'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

interface DirectoryBlock {
  readonly directory: string
  readonly ownsDirectory: (owner: Pick<ManagedAgentSession, 'workspaceDirectory'>) => boolean
}

/** Keeps directory removal admission separate from logical Agent/canvas ownership. */
export class AgentExecutionDirectoryCoordinator implements AgentExecutionDirectoryPort {
  private readonly blocked = new Set<DirectoryBlock>()

  constructor(private readonly directories: AgentExecutionDirectoryPort) {}

  async resolve(
    command: Parameters<AgentExecutionDirectoryPort['resolve']>[0]
  ): Promise<string | null> {
    const directory = await this.directories.resolve(command)
    if (!directory) return null
    return [...this.blocked].some(
      ({ directory: blocked, ownsDirectory }) =>
        containsDirectory(blocked, directory) && !ownsDirectory(command)
    )
      ? null
      : directory
  }

  async block(
    directory: string,
    sessions: Iterable<ManagedAgentSession>,
    ownsDirectory: DirectoryBlock['ownsDirectory']
  ): Promise<() => void> {
    const canonical =
      (await this.directories.resolve({
        workspaceDirectory: directory,
        executionDirectory: directory
      })) ?? directory
    const block = { directory: canonical, ownsDirectory }
    this.blocked.add(block)
    try {
      for (const session of sessions) {
        if (
          !session.isTerminalRunning &&
          !['not_started', 'starting'].includes(session.runtime.terminal.status)
        )
          continue
        const home =
          (await this.directories.resolve({
            workspaceDirectory: session.workspaceDirectory,
            executionDirectory: session.workspaceDirectory
          })) ?? session.workspaceDirectory
        const actual = session.executionDirectory ?? home
        if (!ownsDirectory(session) && containsDirectory(canonical, actual)) {
          throw createExpectedAppError(
            'WORKSPACE_DIRECTORY_IN_USE',
            'Workspace directory is used by an Agent from another workspace.',
            { agentId: session.agentId, workspaceId: session.workspaceId }
          )
        }
      }
    } catch (error) {
      this.blocked.delete(block)
      throw error
    }
    return () => {
      this.blocked.delete(block)
    }
  }
}

function containsDirectory(parent: string, directory: string): boolean {
  const normalize = (value: string): string => {
    const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '')
    return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized
  }
  const root = normalize(parent)
  const target = normalize(directory)
  return target === root || target.startsWith(`${root}/`)
}
