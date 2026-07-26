import type { AgentSessionService } from '../../contexts/agent/application/use-cases/AgentSessionService'
import type { WorkspaceAgentLifecyclePort } from '../../contexts/project/application/ports/WorkspaceAgentLifecyclePort'

export function createAgentLifecycle(service: AgentSessionService): WorkspaceAgentLifecyclePort {
  return {
    disposeProject: (projectDirectory) => service.disposeProject(projectDirectory),
    disposeWorkspace: (command) => service.disposeSession(command),
    isWorkspaceQuarantined: (command) =>
      service.isWorkspaceQuarantined(command.projectDirectory, command.workspaceId),
    resolveProjectQuarantines: (projectDirectory) =>
      service.resolveProjectQuarantines(projectDirectory),
    suspend: (workspaceDirectory) => service.suspendWorkspaceDirectory(workspaceDirectory)
  }
}

export async function disposeRuntime(operation: () => Promise<{ release(): void }>): Promise<void> {
  const lease = await operation()
  lease.release()
}
