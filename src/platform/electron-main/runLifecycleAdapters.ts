import type { TerminalRunLifecyclePort } from '../../contexts/block-graph/application/ports/TerminalRunLifecyclePort'
import type { WorkspaceRunLifecyclePort } from '../../contexts/project/application/ports/WorkspaceRunLifecyclePort'
import type { RunLifecycleService } from '../../contexts/run/application/use-cases/RunLifecycleService'

type RunLifecycleContract = Pick<
  RunLifecycleService,
  | 'hardDisposeProject'
  | 'hardDisposeTerminal'
  | 'hardDisposeWorkspace'
  | 'hardDisposeWorkspaces'
  | 'isWorkspaceQuarantined'
  | 'resolveProjectQuarantines'
>

export function createRunLifecycleAdapters(service: RunLifecycleContract): {
  readonly terminalRuns: TerminalRunLifecyclePort
  readonly workspaceRuns: WorkspaceRunLifecyclePort
} {
  return {
    terminalRuns: {
      acquireTerminalDeletion: async (scope) => {
        const lease = await service.hardDisposeTerminal(scope)

        return {
          hardDispose: async () => undefined,
          quarantine: lease.quarantine,
          release: lease.release,
          resolve: lease.resolve
        }
      }
    },
    workspaceRuns: {
      disposeProject: (projectDirectory) => service.hardDisposeProject(projectDirectory),
      disposeWorkspace: (scope) => service.hardDisposeWorkspace(scope),
      disposeWorkspaces: (scope) => service.hardDisposeWorkspaces(scope),
      isWorkspaceQuarantined: (scope) => service.isWorkspaceQuarantined(scope),
      resolveProjectQuarantines: (projectDirectory) =>
        service.resolveProjectQuarantines(projectDirectory)
    }
  }
}
