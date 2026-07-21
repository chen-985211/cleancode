import type { TerminalRunOwner } from '../../domain/value-objects/TerminalRunScope'

export function getTerminalSessionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function throwTerminalSessionCleanupFailures(
  results: readonly PromiseSettledResult<void>[]
): void {
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  )
  if (failures.length === 0) return
  if (failures.length === 1) throw failures[0]
  throw new AggregateError(failures, 'Multiple terminal session resources failed to dispose.')
}

export function createTerminalSessionOwner(command: {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly terminalBlockId: string
}): TerminalRunOwner {
  return {
    projectId: command.projectId,
    projectDirectory: command.projectDirectory,
    workspaceName: command.workspaceName,
    workspaceDirectory: command.workspaceDirectory,
    gitBranch: command.gitBranch,
    blockId: command.terminalBlockId
  }
}

export function createTerminalSessionId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random()}`
}
