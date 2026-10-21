import {
  defaultTerminalBlockSize,
  type ResizeTerminalBlockInput,
  type TerminalBlockSnapshot,
  type TerminalConnectionSnapshot
} from '../aggregates/BlockGraphTypes'
import { normalizeTerminalBlockSize } from './BlockGraphNormalization'

export const defaultWorkflowTerminalSize = { width: 420, height: 280 }

export function terminalExpansionSize(
  block: TerminalBlockSnapshot,
  connections: readonly TerminalConnectionSnapshot[],
  mode: 'normalize' | 'expand' = 'normalize'
) {
  const usesDefaultSize =
    (block.size.width === defaultTerminalBlockSize.width &&
      block.size.height === defaultTerminalBlockSize.height) ||
    (block.size.width === 560 && block.size.height === 340)
  return (mode === 'expand' || usesDefaultSize) &&
    connections.some((edge) => edge.sourceBlockId === block.id || edge.targetBlockId === block.id)
    ? defaultWorkflowTerminalSize
    : block.size
}

export function resizedTerminalBlock(
  block: TerminalBlockSnapshot,
  input: ResizeTerminalBlockInput,
  connections: readonly TerminalConnectionSnapshot[]
): TerminalBlockSnapshot {
  const size = normalizeTerminalBlockSize(input.size)
  const expanding = block.isCollapsed && input.isCollapsed === false
  return {
    ...block,
    position: input.position,
    size: expanding ? terminalExpansionSize({ ...block, size }, connections, 'expand') : size,
    ...(input.isCollapsed === undefined ? {} : { isCollapsed: input.isCollapsed })
  }
}
