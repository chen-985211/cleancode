import type { Node } from '@xyflow/react'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'

import {
  type BlockGraphSnapshot,
  minimumTerminalBlockSize,
  type TerminalBlockSnapshot,
  type TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { GitBranchNavigationItemSnapshot } from '../../contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import type { TerminalSessionStatus } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { WorkflowRunNodeStatus } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type { TerminalExecutionConfigSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'

export interface WorkbenchSnapshot {
  readonly agents?: readonly WorkspaceAgentSnapshot[]
  readonly project: ProjectSnapshot
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
}

export interface TerminalViewState {
  readonly sessionId: string | null
  readonly status: TerminalSessionStatus
  readonly output: string
}

export interface TerminalDimensions {
  readonly columns: number
  readonly rows: number
}

export interface TerminalBlockMetadataInput {
  readonly name: string
  readonly description: string
  readonly launchCommand: string
}

export interface TerminalGroupMetadataInput {
  readonly name: string
}

export interface WorkbenchNodeLayoutInput {
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly width: number; readonly height: number }
}
export type TerminalGroupDropFeedback = 'join' | 'leave' | 'dissolve'

interface TerminalNodeData extends Record<string, unknown> {
  readonly block: TerminalBlockSnapshot
  readonly session: TerminalViewState
  readonly isSelected: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly canSelectForTerminalGroup: boolean
  readonly isNavigationHighlighted: boolean
  readonly workflowStatus?: WorkflowRunNodeStatus
  readonly onStart: (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => void
  readonly onStop: (block: TerminalBlockSnapshot) => void
  readonly onQuickLaunch: (block: TerminalBlockSnapshot) => void
  readonly onRestart: (block: TerminalBlockSnapshot) => void
  readonly onDelete: (block: TerminalBlockSnapshot) => void
  readonly onUpdateMetadata: (
    block: TerminalBlockSnapshot,
    metadata: TerminalBlockMetadataInput
  ) => Promise<void>
  readonly onUpdateExecutionConfig?: (
    block: TerminalBlockSnapshot,
    executionConfig: TerminalExecutionConfigSnapshot
  ) => Promise<void>
  readonly onRunFromHere?: (block: TerminalBlockSnapshot) => void
  readonly onInput: (block: TerminalBlockSnapshot, input: string) => void
  readonly onResize: (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => void
  readonly onResizeBlock: (
    block: TerminalBlockSnapshot,
    layout: WorkbenchNodeLayoutInput
  ) => Promise<void>
  readonly onSelect?: (additive: boolean) => void
  readonly onToggleTerminalGroupCandidate: (block: TerminalBlockSnapshot) => void
}

export type TerminalFlowNode = Node<TerminalNodeData, 'terminal'>

interface TerminalGroupNodeData extends Record<string, unknown> {
  readonly group: TerminalGroupSnapshot
  readonly memberBlocks: readonly TerminalBlockSnapshot[]
  readonly memberStates: Record<string, TerminalViewState>
  readonly selectedUngroupedTerminalBlockIds: readonly string[]
  readonly selectedMemberBlockIds: readonly string[]
  readonly isSelected: boolean
  readonly dropFeedback: TerminalGroupDropFeedback | null
  readonly onStartGroup: (group: TerminalGroupSnapshot) => void
  readonly onStopGroup: (group: TerminalGroupSnapshot) => void
  readonly onRestartGroup: (group: TerminalGroupSnapshot) => void
  readonly onUpdateGroupMetadata: (
    group: TerminalGroupSnapshot,
    metadata: TerminalGroupMetadataInput
  ) => Promise<void>
  readonly onToggleGroupCollapsed: (
    group: TerminalGroupSnapshot,
    isCollapsed: boolean
  ) => Promise<void>
  readonly onAddSelectedTerminalsToGroup: (group: TerminalGroupSnapshot) => Promise<void>
  readonly onRemoveSelectedTerminalsFromGroup: (group: TerminalGroupSnapshot) => Promise<void>
  readonly onRemoveTerminalFromGroup: (
    group: TerminalGroupSnapshot,
    block: TerminalBlockSnapshot
  ) => Promise<void>
  readonly onDissolveGroup: (group: TerminalGroupSnapshot) => Promise<void>
}

export type TerminalGroupFlowNode = Node<TerminalGroupNodeData, 'terminalGroup'>
interface AgentConsoleNodeData extends Record<string, unknown> {
  readonly agent: WorkspaceAgentSnapshot
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | null
  readonly onGraphUpdated: (graph: BlockGraphSnapshot) => void
  readonly onMcpCapabilityChange: (
    agent: WorkspaceAgentSnapshot,
    enabled: boolean
  ) => Promise<UpdateWorkspaceAgentMcpCapabilityResult | undefined>
  readonly onRemove: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRename: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  readonly onResize: (
    agent: WorkspaceAgentSnapshot,
    layout: WorkbenchNodeLayoutInput
  ) => Promise<void>
  readonly onSelect?: () => void
}

export type AgentConsoleFlowNode = Node<AgentConsoleNodeData, 'agentConsole'>
export type WorkbenchFlowNode = AgentConsoleFlowNode | TerminalFlowNode | TerminalGroupFlowNode
export type MinimapFlowNode = WorkbenchFlowNode

export const defaultTerminalDimensions: TerminalDimensions = {
  columns: 80,
  rows: 24
}

export const terminalNodeMinimumSize = minimumTerminalBlockSize

export const terminalOutputBrowserEventName = 'cleancode-terminal-output'

export function createIdleTerminalState(): TerminalViewState {
  return {
    sessionId: null,
    status: 'idle',
    output: ''
  }
}
