import type { Node } from '@xyflow/react'

import type {
  BlockGraphSnapshot,
  TerminalBlockSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import type { TerminalSessionStatus } from '../../contexts/run/application/dto/TerminalSessionSnapshot'

export interface WorkbenchSnapshot {
  readonly project: ProjectSnapshot
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

interface TerminalNodeData extends Record<string, unknown> {
  readonly block: TerminalBlockSnapshot
  readonly session: TerminalViewState
  readonly isSelected: boolean
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
}

export type TerminalFlowNode = Node<TerminalNodeData, 'terminal'>

export const defaultTerminalDimensions: TerminalDimensions = {
  columns: 80,
  rows: 24
}

export const terminalNodeDefaultSize = {
  width: 420,
  height: 306
}

export const terminalOutputBrowserEventName = 'cleancode-terminal-output'

export function createIdleTerminalState(): TerminalViewState {
  return {
    sessionId: null,
    status: 'idle',
    output: ''
  }
}
