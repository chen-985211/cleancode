import type { AgentGraphUpdatedEvent } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import {
  defaultAgentLayoutPosition,
  defaultAgentLayoutSize
} from '../../contexts/agent/domain/aggregates/AgentSession'
import { createCanvasObjectIdentityKey } from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { AgentToolApprovalController } from './agentToolApprovalTypes'
import type { TerminalDimensions } from '../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { WorkbenchSnapshot } from './types/workbenchSnapshot'

const rendererLegacyDefaultProviderId = 'codex'

export interface AgentTerminalMeasurement {
  readonly dimensions: TerminalDimensions
  readonly workspaceKey: string
}

export interface AgentConsoleProps {
  readonly agent?: WorkspaceAgentSnapshot
  readonly approvalController?: AgentToolApprovalController
  readonly currentWorkbench?: WorkbenchSnapshot | null
  readonly currentWorkspace?: WorkbenchSnapshot['project']['workspaces'][number] | null
  readonly onGraphUpdated?: (event: AgentGraphUpdatedEvent) => void
  readonly onMcpCapabilityChange?: (
    agent: WorkspaceAgentSnapshot,
    enabled: boolean
  ) => Promise<UpdateWorkspaceAgentMcpCapabilityResult | undefined>
  readonly onRemove?: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRename?: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  readonly onSelect?: () => void
}

export function createWorkspaceKey(
  workbench: WorkbenchSnapshot | null,
  workspace: WorkbenchSnapshot['project']['workspaces'][number] | null,
  agentId: string
): string | null {
  return workbench && workspace
    ? createCanvasObjectIdentityKey({
        projectId: workbench.project.id,
        workspaceId: workspace.workspaceId,
        objectKind: 'agent',
        objectId: agentId
      })
    : null
}

export function createFallbackAgent(
  workbench: WorkbenchSnapshot | null,
  workspace: WorkbenchSnapshot['project']['workspaces'][number] | null
): WorkspaceAgentSnapshot {
  return {
    agentId: 'default-agent',
    cleancodeMcpEnabled: true,
    layout: { position: defaultAgentLayoutPosition, size: defaultAgentLayoutSize },
    name: 'Agent 1',
    projectId: workbench?.project.id ?? 'unselected-project',
    providerId: rendererLegacyDefaultProviderId,
    workspaceId: workspace?.workspaceId ?? 'unselected-workspace'
  }
}

export function isTestRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}

export function noop(): void {
  return undefined
}
