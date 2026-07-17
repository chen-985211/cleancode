import type {
  AgentGraphUpdatedEvent,
  AgentSessionSnapshot
} from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import {
  defaultAgentLayoutPosition,
  defaultAgentLayoutSize
} from '../../contexts/agent/domain/aggregates/AgentSession'
import type { AgentXtermController } from './agentTerminalXterm'
import type { AgentToolApprovalController } from './agentToolApprovalTypes'
import type { TerminalDimensions, WorkbenchSnapshot } from './types'

export interface AgentTerminalMeasurement {
  readonly dimensions: TerminalDimensions
  readonly workspaceKey: string
}

export interface AgentSessionBinding {
  readonly session: AgentSessionSnapshot
  readonly terminalController: AgentXtermController | null
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
    ? `${workbench.project.id}\0${workspace.name}\0${workspace.gitBranch ?? ''}\0${agentId}`
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
    workspaceName: workspace?.name ?? 'unselected-workspace'
  }
}

export function isTestRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}

export function noop(): void {
  return undefined
}

export function haveSameDimensions(left: TerminalDimensions, right: TerminalDimensions): boolean {
  return left.columns === right.columns && left.rows === right.rows
}

export function restoreRecordedAgentSessionExit(
  session: AgentSessionSnapshot,
  exitedSessionIds: ReadonlySet<string>
): AgentSessionSnapshot {
  return exitedSessionIds.has(session.sessionId) && session.status === 'running'
    ? { ...session, status: 'exited' }
    : session
}
