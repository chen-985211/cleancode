/// <reference types="vite/client" />

import type {
  AgentGraphUpdatedEvent,
  AgentPtyExitEvent,
  AgentPtyOutputEvent,
  AgentSessionSnapshot,
  AgentTerminalSourceTheme,
  AgentToolApprovalDecisionResult,
  AgentToolApprovalRequest
} from './contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from './contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from './contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import type { CodexCliInstallationSnapshot } from './contexts/agent/application/ports/CodexCliPort'
import type { AgentLayoutSnapshot } from './contexts/agent/domain/aggregates/AgentSession'
import type {
  BlockGraphSnapshot,
  BlockPositionSnapshot,
  CanvasViewportSnapshot,
  TerminalBlockSizeSnapshot,
  TerminalExecutionConfigSnapshot
} from './contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { GitBranchNavigationItemSnapshot } from './contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from './contexts/project/application/dto/ProjectSnapshot'
import type { TerminalSessionSnapshot } from './contexts/run/application/dto/TerminalSessionSnapshot'
import type { WorkflowRunSnapshot } from './contexts/run/application/dto/WorkflowRunSnapshot'
import type { TerminalWorkflowEvent } from './contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import type {
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalWorkingDirectorySnapshot
} from './contexts/run/application/ports/TerminalProcessPort'

interface WorkbenchSnapshot {
  readonly agents: readonly WorkspaceAgentSnapshot[]
  readonly project: ProjectSnapshot
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
}

declare global {
  interface Window {
    cleancode?: {
      appName: 'cleancode'
      listWorkbenches(): Promise<WorkbenchSnapshot[]>
      addProject(): Promise<WorkbenchSnapshot | null>
      removeProject(command: { readonly projectDirectory: string }): Promise<WorkbenchSnapshot[]>
      createBranchWorkspace(command: {
        readonly projectDirectory: string
        readonly branchName: string
      }): Promise<WorkbenchSnapshot>
      switchBranchWorkspace(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
      }): Promise<WorkbenchSnapshot>
      archiveBranchWorkspace(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
      }): Promise<WorkbenchSnapshot>
      checkoutMainWorkspaceBranch(command: {
        readonly projectDirectory: string
        readonly branchName: string
      }): Promise<WorkbenchSnapshot>
      synchronizeProjectGitState(command: {
        readonly projectDirectory: string
      }): Promise<WorkbenchSnapshot | null>
      inspectCodexCli(): Promise<CodexCliInstallationSnapshot>
      attachAgentSession(command: {
        readonly agentId: string
        readonly columns?: number
        readonly gitBranch?: string | null
        readonly persistenceMode?: 'ephemeral' | 'persistent'
        readonly projectDirectory: string
        readonly projectId: string
        readonly restartMode?: 'new' | 'retry'
        readonly rows?: number
        readonly terminalSourceTheme: AgentTerminalSourceTheme
        readonly workspaceDirectory: string
        readonly workspaceName: string
      }): Promise<AgentSessionSnapshot>
      createWorkspaceAgent(command: {
        readonly layout: AgentLayoutSnapshot
        readonly projectId: string
        readonly workspaceName: string
      }): Promise<WorkspaceAgentSnapshot>
      renameWorkspaceAgent(command: {
        readonly agentId: string
        readonly name: string
        readonly projectId: string
        readonly workspaceName: string
      }): Promise<WorkspaceAgentSnapshot>
      updateWorkspaceAgentLayout(command: {
        readonly agentId: string
        readonly layout: AgentLayoutSnapshot
        readonly projectId: string
        readonly workspaceName: string
      }): Promise<WorkspaceAgentSnapshot>
      updateWorkspaceAgentMcpCapability(command: {
        readonly agentId: string
        readonly cleancodeMcpEnabled: boolean
        readonly projectId: string
        readonly workspaceName: string
      }): Promise<UpdateWorkspaceAgentMcpCapabilityResult>
      removeWorkspaceAgent(command: {
        readonly agentId: string
        readonly projectId: string
        readonly workspaceName: string
      }): Promise<readonly WorkspaceAgentSnapshot[]>
      writeAgentSession(command: {
        readonly input: string
        readonly sessionId: string
      }): Promise<void>
      resizeAgentSession(command: {
        readonly columns: number
        readonly rows: number
        readonly sessionId: string
      }): Promise<void>
      disposeAgentWorkspaceSession(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
      }): Promise<void>
      disposeProjectAgentSessions(command: { readonly projectDirectory: string }): Promise<void>
      approveAgentTool(command: {
        readonly approvalId: string
      }): Promise<AgentToolApprovalDecisionResult>
      rejectAgentTool(command: { readonly approvalId: string }): Promise<void>
      onAgentPtyOutput(listener: (event: AgentPtyOutputEvent) => void): () => void
      onAgentPtyExit(listener: (event: AgentPtyExitEvent) => void): () => void
      onAgentGraphUpdated(listener: (event: AgentGraphUpdatedEvent) => void): () => void
      onAgentToolApprovalRequested(listener: (event: AgentToolApprovalRequest) => void): () => void
      createTerminalBlock(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly name: string
        readonly description: string
        readonly position: BlockPositionSnapshot
      }): Promise<BlockGraphSnapshot>
      createTerminalGroup(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly name: string
        readonly memberBlockIds: readonly string[]
      }): Promise<BlockGraphSnapshot>
      connectTerminalBlocks(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly sourceBlockId: string
        readonly targetBlockId: string
      }): Promise<BlockGraphSnapshot>
      disconnectTerminalBlocks(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly connectionId: string
      }): Promise<BlockGraphSnapshot>
      updateTerminalBlockMetadata(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly blockId: string
        readonly name: string
        readonly description: string
        readonly launchCommand: string
      }): Promise<BlockGraphSnapshot>
      updateTerminalExecutionConfig(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly blockId: string
        readonly executionConfig: TerminalExecutionConfigSnapshot
      }): Promise<BlockGraphSnapshot>
      updateTerminalGroupMetadata(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly terminalGroupId: string
        readonly name: string
      }): Promise<BlockGraphSnapshot>
      setTerminalGroupCollapsed(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly terminalGroupId: string
        readonly isCollapsed: boolean
      }): Promise<BlockGraphSnapshot>
      addTerminalToGroup(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly terminalGroupId: string
        readonly blockId: string
      }): Promise<BlockGraphSnapshot>
      removeTerminalFromGroup(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly terminalGroupId: string
        readonly blockId: string
      }): Promise<BlockGraphSnapshot>
      dissolveTerminalGroup(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly terminalGroupId: string
      }): Promise<BlockGraphSnapshot>
      resizeTerminalBlock(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly blockId: string
        readonly position: BlockPositionSnapshot
        readonly size: TerminalBlockSizeSnapshot
      }): Promise<BlockGraphSnapshot>
      updateGraphViewport(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly viewport: CanvasViewportSnapshot
      }): Promise<BlockGraphSnapshot>
      moveBlock(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly blockId: string
        readonly position: BlockPositionSnapshot
      }): Promise<BlockGraphSnapshot>
      moveTerminalGroup(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly terminalGroupId: string
        readonly position: BlockPositionSnapshot
      }): Promise<BlockGraphSnapshot>
      deleteBlock(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly blockId: string
      }): Promise<BlockGraphSnapshot>
      saveGraph(command: {
        readonly projectDirectory: string
        readonly graph: BlockGraphSnapshot
      }): Promise<BlockGraphSnapshot>
      startTerminal(command: {
        readonly terminalBlockId: string
        readonly workspaceName: string
        readonly workingDirectory: string
        readonly shell?: string
        readonly columns?: number
        readonly rows?: number
      }): Promise<TerminalSessionSnapshot>
      writeTerminal(command: {
        readonly sessionId: string
        readonly input: string
      }): Promise<TerminalSessionSnapshot>
      resizeTerminal(command: {
        readonly sessionId: string
        readonly columns: number
        readonly rows: number
      }): Promise<void>
      interruptTerminal(command: { readonly sessionId: string }): Promise<TerminalSessionSnapshot>
      listTerminalWorkingDirectories(command: {
        readonly sessionIds: readonly string[]
      }): Promise<TerminalWorkingDirectorySnapshot[]>
      terminateTerminal(command: { readonly sessionId: string }): Promise<TerminalSessionSnapshot>
      startTerminalWorkflow(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly workingDirectory: string
        readonly scope:
          { readonly type: 'full' } | { readonly type: 'from-block'; readonly blockId: string }
        readonly shell?: string
        readonly columns?: number
        readonly rows?: number
      }): Promise<WorkflowRunSnapshot>
      stopTerminalWorkflow(command: {
        readonly workspaceName: string
      }): Promise<WorkflowRunSnapshot | null>
      getTerminalWorkflow(command: {
        readonly workspaceName: string
      }): Promise<WorkflowRunSnapshot | null>
      onTerminalWorkflowEvent(listener: (event: TerminalWorkflowEvent) => void): () => void
      onTerminalOutput(listener: (event: TerminalOutputEvent) => void): () => void
      onTerminalExit(listener: (event: TerminalExitEvent) => void): () => void
    }
  }
}

export {}
