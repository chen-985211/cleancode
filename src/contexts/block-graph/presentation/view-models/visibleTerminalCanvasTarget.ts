import type { BlockGraphSnapshot } from '../../application/dto/BlockGraphSnapshot'

export interface VisibleTerminalCanvasTarget {
  readonly nodeId: string
  readonly objectId: string
  readonly objectKind: 'terminal' | 'terminal-group'
}

export function resolveVisibleTerminalCanvasTarget(
  graph: BlockGraphSnapshot,
  blockId: string
): VisibleTerminalCanvasTarget | null {
  const terminal = graph.blocks.find((candidate) => candidate.id === blockId)
  if (!terminal) return null

  const collapsedGroup = graph.terminalGroups.find(
    (group) => group.isCollapsed && group.memberBlockIds.includes(terminal.id)
  )

  return collapsedGroup
    ? {
        nodeId: collapsedGroup.id,
        objectId: collapsedGroup.id,
        objectKind: 'terminal-group'
      }
    : {
        nodeId: terminal.id,
        objectId: terminal.id,
        objectKind: 'terminal'
      }
}
