/// <reference types="vite/client" />

import type {
  AgentGraphUpdatedEvent,
  AgentRuntimeChangedEvent,
  AgentSessionSnapshot,
  AgentTerminalSourceTheme,
  AgentToolApprovalDecisionResult,
  AgentToolApprovalRequest
} from './contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from './contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from './contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import type {
  AgentProviderAvailability,
  AgentProviderDescriptor
} from './contexts/agent/application/ports/AgentProviderContribution'
import type { AgentProviderPreferencesSnapshot } from './contexts/agent/domain/aggregates/AgentProviderPreferences'
import type { UpdateAgentProviderPreferencesCommand } from './contexts/agent/application/use-cases/UpdateAgentProviderPreferencesUseCase'
import type { CreatableAgentProviderSnapshot } from './contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import type { AgentLayoutSnapshot } from './contexts/agent/domain/aggregates/AgentSession'
import type {
  BatchTerminalRemovalTargetSnapshot,
  BlockGraphSnapshot,
  BlockPositionSnapshot,
  CanvasViewportSnapshot,
  QuickExecutionSlotNumber,
  QuickExecutionTargetSnapshot,
  TerminalBlockSizeSnapshot,
  TerminalExecutionConfigSnapshot
} from './contexts/block-graph/application/dto/BlockGraphSnapshot'
import type {
  BlockTemplateScope,
  BlockTemplateSnapshot
} from './contexts/block-graph/application/dto/BlockTemplateSnapshot'
import type { InstantiateBlockTemplateResult } from './contexts/block-graph/application/use-cases/InstantiateBlockTemplateUseCase'
import type { GitBranchNavigationItemSnapshot } from './contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from './contexts/project/application/dto/ProjectSnapshot'
import type { TerminalSessionSnapshot } from './contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalSourceTheme } from './contexts/run/domain/aggregates/TerminalSession'
import type { TerminalRuntimeAvailabilitySnapshot } from './contexts/run/application/dto/TerminalRuntimeAvailability'
import type { TerminalSnapshot } from './contexts/run/application/dto/TerminalModelSnapshot'
import type { TerminalViewOutputEvent } from './contexts/run/application/ports/TerminalModelPort'
import type {
  TerminalRunEvent,
  TerminalServiceEndpoint
} from './contexts/run/application/dto/TerminalRunEvent'
import type { WorkflowRunSnapshot } from './contexts/run/application/dto/WorkflowRunSnapshot'
import type { TerminalWorkflowEvent } from './contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import type {
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalWorkingDirectorySnapshot
} from './contexts/run/application/ports/TerminalProcessPort'

interface WorkbenchSnapshot {
  readonly agents: readonly WorkspaceAgentSnapshot[]
  readonly isCurrentProject?: boolean
  readonly project: ProjectSnapshot
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
}

declare global {
  interface Window {
    cleancode?: {
      appName: 'cleancode'
      getPathForFile(file: File): string
      getWindowFullScreenState(): Promise<boolean>
      onWindowFullScreenStateChange(listener: (isFullScreen: boolean) => void): () => void
      listWorkbenches(): Promise<WorkbenchSnapshot[]>
      addProject(): Promise<WorkbenchSnapshot | null>
      removeProject(command: { readonly projectDirectory: string }): Promise<WorkbenchSnapshot[]>
      reorderProject(command: {
        readonly projectDirectory: string
        readonly beforeProjectDirectory: string | null
      }): Promise<WorkbenchSnapshot[]>
      createBranchWorkspace(command: {
        readonly projectDirectory: string
        readonly branchName: string
      }): Promise<WorkbenchSnapshot>
      switchBranchWorkspace(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
      }): Promise<WorkbenchSnapshot>
      archiveBranchWorkspace(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly lockedWorktreeConfirmation?: { readonly lockReason: string | null }
      }): Promise<WorkbenchSnapshot>
      checkoutMainWorkspaceBranch(command: {
        readonly projectDirectory: string
        readonly branchName: string
      }): Promise<WorkbenchSnapshot>
      synchronizeProjectGitState(command: {
        readonly projectDirectory: string
      }): Promise<WorkbenchSnapshot | null>
      inspectAgentProvider(command: {
        readonly providerId: string
      }): Promise<AgentProviderAvailability>
      getAgentProviderPreferences(): Promise<AgentProviderPreferencesSnapshot>
      updateAgentProviderPreferences(
        command: UpdateAgentProviderPreferencesCommand
      ): Promise<AgentProviderPreferencesSnapshot>
      discoverCreatableAgentProviders(command?: {
        readonly refresh?: boolean
      }): Promise<readonly CreatableAgentProviderSnapshot[]>
      listAgentProviders(): Promise<readonly AgentProviderDescriptor[]>
      attachAgentSession(command: {
        readonly agentId: string
        readonly columns?: number
        readonly gitBranch?: string | null
        readonly persistenceMode?: 'ephemeral' | 'persistent'
        readonly projectDirectory: string
        readonly projectId: string
        readonly providerId?: string
        readonly restartMode?: 'new' | 'retry'
        readonly rows?: number
        readonly terminalSourceTheme: AgentTerminalSourceTheme
        readonly workspaceDirectory: string
        readonly workspaceId: string
      }): Promise<AgentSessionSnapshot>
      createWorkspaceAgent(command: {
        readonly agentId: string
        readonly gitBranch: string | null
        readonly initialPosition: { readonly x: number; readonly y: number }
        readonly projectDirectory: string
        readonly projectId: string
        readonly providerId: string
        readonly workspaceDirectory: string
        readonly workspaceId: string
      }): Promise<WorkspaceAgentSnapshot>
      renameWorkspaceAgent(command: {
        readonly agentId: string
        readonly name: string
        readonly projectId: string
        readonly workspaceId: string
      }): Promise<WorkspaceAgentSnapshot>
      updateWorkspaceAgentLayout(command: {
        readonly agentId: string
        readonly layout: AgentLayoutSnapshot
        readonly projectId: string
        readonly workspaceId: string
      }): Promise<WorkspaceAgentSnapshot>
      updateWorkspaceAgentMcpCapability(command: {
        readonly agentId: string
        readonly cleancodeMcpEnabled: boolean
        readonly projectId: string
        readonly workspaceId: string
      }): Promise<UpdateWorkspaceAgentMcpCapabilityResult>
      removeWorkspaceAgent(command: {
        readonly agentId: string
        readonly projectId: string
        readonly workspaceId: string
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
        readonly workspaceId: string
      }): Promise<void>
      disposeProjectAgentSessions(command: { readonly projectDirectory: string }): Promise<void>
      approveAgentTool(command: {
        readonly approvalId: string
      }): Promise<AgentToolApprovalDecisionResult>
      rejectAgentTool(command: { readonly approvalId: string }): Promise<void>
      onAgentRuntimeChanged(listener: (event: AgentRuntimeChangedEvent) => void): () => void
      onAgentGraphUpdated(listener: (event: AgentGraphUpdatedEvent) => void): () => void
      onAgentToolApprovalRequested(listener: (event: AgentToolApprovalRequest) => void): () => void
      createTerminalBlock(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly name: string
        readonly description: string
        readonly position: BlockPositionSnapshot
      }): Promise<BlockGraphSnapshot>
      addQuickExecutionTarget(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly target: QuickExecutionTargetSnapshot
      }): Promise<BlockGraphSnapshot>
      bindQuickExecutionSlot(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly number: QuickExecutionSlotNumber
        readonly target: QuickExecutionTargetSnapshot
      }): Promise<BlockGraphSnapshot>
      clearQuickExecutionSlot(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly number: QuickExecutionSlotNumber
      }): Promise<BlockGraphSnapshot>
      reorderQuickExecutionSlots(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly sourceNumber: QuickExecutionSlotNumber
        readonly destinationNumber: QuickExecutionSlotNumber
      }): Promise<BlockGraphSnapshot>
      createTerminalGroup(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly name: string
        readonly memberBlockIds: readonly string[]
      }): Promise<BlockGraphSnapshot>
      connectTerminalBlocks(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly sourceBlockId: string
        readonly targetBlockId: string
      }): Promise<BlockGraphSnapshot>
      disconnectTerminalBlocks(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly connectionId: string
      }): Promise<BlockGraphSnapshot>
      updateTerminalBlockMetadata(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly blockId: string
        readonly name: string
        readonly description: string
        readonly launchCommand: string
      }): Promise<BlockGraphSnapshot>
      updateTerminalExecutionConfig(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly blockId: string
        readonly executionConfig: TerminalExecutionConfigSnapshot
      }): Promise<BlockGraphSnapshot>
      updateTerminalDefinition(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly blockId: string
        readonly name: string
        readonly description: string
        readonly launchCommand: string
        readonly executionConfig: TerminalExecutionConfigSnapshot
      }): Promise<BlockGraphSnapshot>
      updateTerminalGroupMetadata(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly terminalGroupId: string
        readonly name: string
      }): Promise<BlockGraphSnapshot>
      setTerminalGroupCollapsed(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly terminalGroupId: string
        readonly isCollapsed: boolean
      }): Promise<BlockGraphSnapshot>
      addTerminalToGroup(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly terminalGroupId: string
        readonly blockId: string
      }): Promise<BlockGraphSnapshot>
      removeTerminalFromGroup(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly terminalGroupId: string
        readonly blockId: string
      }): Promise<BlockGraphSnapshot>
      dissolveTerminalGroup(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly terminalGroupId: string
      }): Promise<BlockGraphSnapshot>
      resizeTerminalBlock(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly blockId: string
        readonly position: BlockPositionSnapshot
        readonly size: TerminalBlockSizeSnapshot
      }): Promise<BlockGraphSnapshot>
      updateGraphViewport(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly viewport: CanvasViewportSnapshot
      }): Promise<BlockGraphSnapshot>
      moveBlock(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly blockId: string
        readonly position: BlockPositionSnapshot
      }): Promise<BlockGraphSnapshot>
      moveTerminalGroup(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly terminalGroupId: string
        readonly position: BlockPositionSnapshot
      }): Promise<BlockGraphSnapshot>
      deleteBlock(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly blockId: string
      }): Promise<BlockGraphSnapshot>
      deleteTerminalScope(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly target: BatchTerminalRemovalTargetSnapshot
      }): Promise<BlockGraphSnapshot>
      listBlockTemplates(command: {
        readonly scope: BlockTemplateScope
      }): Promise<readonly BlockTemplateSnapshot[]>
      saveBlockTemplate(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly selectedBlockIds: readonly string[]
        readonly name: string
        readonly description: string
        readonly scope: BlockTemplateScope
      }): Promise<BlockTemplateSnapshot>
      updateBlockTemplate(command: {
        readonly templateId: string
        readonly name: string
        readonly description: string
      }): Promise<BlockTemplateSnapshot>
      moveBlockTemplate(command: {
        readonly templateId: string
        readonly scope: BlockTemplateScope
      }): Promise<BlockTemplateSnapshot>
      deleteBlockTemplate(command: { readonly templateId: string }): Promise<void>
      instantiateBlockTemplate(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly templateId: string
        readonly origin: BlockPositionSnapshot
      }): Promise<InstantiateBlockTemplateResult>
      startTerminal(command: {
        readonly projectId: string
        readonly projectDirectory: string
        readonly terminalBlockId: string
        readonly workspaceId: string
        readonly workspaceDirectory: string
        readonly gitBranch: string | null
        readonly terminalSourceTheme: TerminalSourceTheme
        readonly shell?: string
        readonly columns?: number
        readonly rows?: number
      }): Promise<TerminalSessionSnapshot>
      launchTerminal(command: {
        readonly projectId: string
        readonly projectDirectory: string
        readonly terminalBlockId: string
        readonly workspaceId: string
        readonly workspaceDirectory: string
        readonly gitBranch: string | null
        readonly terminalSourceTheme: TerminalSourceTheme
        readonly shell?: string
        readonly columns?: number
        readonly rows?: number
      }): Promise<{
        readonly session: TerminalSessionSnapshot
        readonly endpoint: TerminalServiceEndpoint | null
      }>
      openTerminalServiceEndpoint(command: {
        readonly runId: string
        readonly sessionId: string
        readonly generation: number
      }): Promise<void>
      openTerminalLink(command: {
        readonly projectId: string
        readonly workspaceId: string
        readonly blockId: string
        readonly sessionId: string
        readonly runId: string
        readonly generation: number
        readonly viewId: string
        readonly owner?: { readonly id: string; readonly kind: 'agent' | 'block' }
        readonly rawTarget: string
      }): Promise<
        | { readonly kind: 'external'; readonly target: string }
        | {
            readonly kind: 'local'
            readonly target: string
            readonly line?: number
            readonly column?: number
          }
      >
      writeTerminal(command: {
        readonly sessionId: string
        readonly input: string
      }): Promise<TerminalSessionSnapshot>
      resizeTerminal(command: {
        readonly sessionId: string
        readonly columns: number
        readonly rows: number
      }): Promise<TerminalSessionSnapshot>
      interruptTerminal(command: { readonly sessionId: string }): Promise<TerminalSessionSnapshot>
      listTerminalSessions(command: {
        readonly sessionIds: readonly string[]
      }): Promise<TerminalSessionSnapshot[]>
      getTerminalRuntimeAvailability(): Promise<TerminalRuntimeAvailabilitySnapshot>
      retryTerminalRuntime(): Promise<TerminalRuntimeAvailabilitySnapshot>
      listRecoveredTerminalSessions(): Promise<TerminalSessionSnapshot[]>
      listRecoveredTerminalServiceEndpoints(): Promise<
        readonly { readonly sessionId: string; readonly endpoint: TerminalServiceEndpoint }[]
      >
      setTerminalRetention(command: {
        readonly sessionId: string
        readonly retentionPolicy: 'terminate-on-application-exit' | 'keep-after-application-exit'
      }): Promise<TerminalSessionSnapshot>
      listTerminalWorkingDirectories(command: {
        readonly sessionIds: readonly string[]
      }): Promise<TerminalWorkingDirectorySnapshot[]>
      terminateTerminal(command: {
        readonly sessionId: string
      }): Promise<TerminalSessionSnapshot | null>
      attachTerminalView(command: {
        readonly projectId: string
        readonly workspaceId: string
        readonly blockId: string
        readonly sessionId: string
        readonly runId: string
        readonly generation: number
        readonly viewId: string
        readonly owner?: { readonly id: string; readonly kind: 'agent' | 'block' }
      }): Promise<TerminalSnapshot>
      detachTerminalView(command: {
        readonly projectId: string
        readonly workspaceId: string
        readonly blockId: string
        readonly sessionId: string
        readonly runId: string
        readonly generation: number
        readonly viewId: string
      }): Promise<void>
      updateTerminalScrollback(command: {
        readonly scrollbackRows: 1000 | 5000 | 10000
      }): Promise<void>
      startTerminalWorkflow(command: {
        readonly projectId: string
        readonly projectDirectory: string
        readonly workspaceId: string
        readonly workspaceDirectory: string
        readonly gitBranch: string | null
        readonly terminalSourceTheme: TerminalSourceTheme
        readonly scope:
          | { readonly type: 'full' }
          | { readonly type: 'from-block'; readonly blockId: string }
          | { readonly type: 'terminal-group'; readonly terminalGroupId: string }
          | { readonly type: 'block-set'; readonly blockIds: readonly string[] }
        readonly shell?: string
        readonly columns?: number
        readonly rows?: number
      }): Promise<WorkflowRunSnapshot>
      stopTerminalWorkflow(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
      }): Promise<WorkflowRunSnapshot | null>
      getTerminalWorkflow(command: {
        readonly projectDirectory: string
        readonly workspaceId: string
      }): Promise<WorkflowRunSnapshot | null>
      onTerminalWorkflowEvent(listener: (event: TerminalWorkflowEvent) => void): () => void
      onTerminalRunEvent(listener: (event: TerminalRunEvent) => void): () => void
      onTerminalOutput(listener: (event: TerminalOutputEvent) => void): () => void
      onTerminalViewOutput(listener: (event: TerminalViewOutputEvent) => void): () => void
      onTerminalSessionUpdated(listener: (session: TerminalSessionSnapshot) => void): () => void
      onTerminalRuntimeAvailability(
        listener: (availability: TerminalRuntimeAvailabilitySnapshot) => void
      ): () => void
      onTerminalExit(listener: (event: TerminalExitEvent) => void): () => void
    }
  }
}

export {}
