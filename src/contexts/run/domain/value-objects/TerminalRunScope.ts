export interface TerminalRunOwner {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly blockId: string
}

export interface TerminalRunScope extends TerminalRunOwner {
  readonly sessionId: string
  readonly runId: string
  readonly generation: number
}

export function createTerminalRunScope(input: TerminalRunScope): TerminalRunScope {
  return Object.freeze({ ...input })
}

export function createTerminalRunSlotKey(owner: TerminalRunOwner): string {
  return [
    owner.projectId,
    owner.projectDirectory,
    owner.workspaceName,
    owner.workspaceDirectory,
    owner.blockId
  ].join('\0')
}

export function isSameTerminalRun(
  left: Pick<TerminalRunScope, 'sessionId' | 'runId' | 'generation'>,
  right: Pick<TerminalRunScope, 'sessionId' | 'runId' | 'generation'>
): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.runId === right.runId &&
    left.generation === right.generation
  )
}
