import type { AgentSession } from '../../domain/aggregates/AgentSession'

export interface InitializeAgentWorkspaceCommand {
  readonly agents: readonly AgentSession[]
  readonly projectId: string
  readonly workspaceName: string
}

export interface AgentWorkspaceInitializer {
  initializeWorkspace(command: InitializeAgentWorkspaceCommand): Promise<readonly AgentSession[]>
}
