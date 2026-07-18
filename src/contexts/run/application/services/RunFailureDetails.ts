import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'

export function createRunAttemptDetails(
  scope: TerminalRunScope,
  port: number
): Readonly<Record<string, string | number | null>> {
  return {
    port,
    attemptedProjectId: scope.projectId,
    attemptedProjectDirectory: scope.projectDirectory,
    attemptedWorkspaceName: scope.workspaceName,
    attemptedWorkspaceDirectory: scope.workspaceDirectory,
    attemptedGitBranch: scope.gitBranch,
    attemptedBlockId: scope.blockId,
    attemptedSessionId: scope.sessionId,
    attemptedRunId: scope.runId,
    attemptedGeneration: scope.generation
  }
}
