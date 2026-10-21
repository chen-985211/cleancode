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
  connections: readonly TerminalConnectionSnapshot[]
) {
  const usesDefaultSize =
    (block.size.width === defaultTerminalBlockSize.width &&
      block.size.height === defaultTerminalBlockSize.height) ||
    (block.size.width === 560 && block.size.height === 340)
  return usesDefaultSize &&
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
  const expandDefault =
    block.isCollapsed &&
    input.isCollapsed === false &&
    size.width === block.size.width &&
    size.height === block.size.height
  return {
    ...block,
    position: input.position,
    size: expandDefault ? terminalExpansionSize(block, connections) : size,
    ...(input.isCollapsed === undefined ? {} : { isCollapsed: input.isCollapsed })
  }
}
