import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createIdleTerminalState,
  type TerminalBlockMetadataInput,
  type TerminalDimensions,
  type TerminalFlowNode,
  type TerminalViewState,
  type WorkbenchSnapshot
} from './types'

interface TerminalFlowNodeHandlers {
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

interface CreateTerminalFlowNodesInput {
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly selectedTerminalBlockId: string | null
  readonly hoveredTerminalBlockId: string | null
  readonly terminalStates: Record<string, TerminalViewState>
  readonly handlers: TerminalFlowNodeHandlers
}

export function createTerminalFlowNodes({
  graph,
  selectedTerminalBlockId,
  hoveredTerminalBlockId,
  terminalStates,
  handlers
}: CreateTerminalFlowNodesInput): TerminalFlowNode[] {
  return (graph?.blocks ?? []).map((block) => {
    const isSelected = selectedTerminalBlockId === block.id
    const isNavigationHighlighted = hoveredTerminalBlockId === block.id

    return {
      id: block.id,
      type: 'terminal',
      position: block.position,
      selected: isSelected,
      data: {
        block,
        session: terminalStates[block.id] ?? createIdleTerminalState(),
        isSelected,
        isNavigationHighlighted,
        ...handlers
      }
    }
  })
}
