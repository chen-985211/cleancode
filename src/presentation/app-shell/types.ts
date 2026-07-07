import type { Node } from '@xyflow/react'

import {
  type BlockGraphSnapshot,
  minimumTerminalBlockSize,
  type TerminalBlockSnapshot,
  type TerminalBlockSizeSnapshot,
  type TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { GitBranchNavigationItemSnapshot } from '../../contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import type { TerminalSessionStatus } from '../../contexts/run/application/dto/TerminalSessionSnapshot'

export interface WorkbenchSnapshot {
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
}

export interface TerminalGroupMetadataInput {
  readonly name: string
}

export type TerminalBlockSizeInput = TerminalBlockSizeSnapshot

interface TerminalNodeData extends Record<string, unknown> {
  readonly block: TerminalBlockSnapshot
  readonly session: TerminalViewState
  readonly isSelected: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly canSelectForTerminalGroup: boolean
  readonly isNavigationHighlighted: boolean
  readonly onStart: (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => void
  readonly onStop: (block: TerminalBlockSnapshot) => void
  readonly onRestart: (block: TerminalBlockSnapshot) => void
  readonly onDelete: (block: TerminalBlockSnapshot) => void
  readonly onUpdateMetadata: (
    block: TerminalBlockSnapshot,
    metadata: TerminalBlockMetadataInput
  ) => Promise<void>
  readonly onInput: (block: TerminalBlockSnapshot, input: string) => void
  readonly onResize: (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => void
  readonly onResizeBlock: (
    block: TerminalBlockSnapshot,
    size: TerminalBlockSizeInput
  ) => Promise<void>
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
export type WorkbenchFlowNode = TerminalFlowNode | TerminalGroupFlowNode

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
