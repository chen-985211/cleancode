import {
  resolveTerminalGroupDropFeedback,
  type TerminalGroupDropAction
} from '../../contexts/block-graph/presentation/view-models/terminalGroupDropTarget'
import type { WorkbenchFlowNode } from './types'

export function projectTerminalGroupDropAction(
  nodes: WorkbenchFlowNode[],
  action: TerminalGroupDropAction
): WorkbenchFlowNode[] {
  let didChange = false
  const nextNodes = nodes.map((node): WorkbenchFlowNode => {
    if (node.type !== 'terminalGroup') return node

    const dropFeedback = resolveTerminalGroupDropFeedback(node.id, action)

    if (node.data.dropFeedback === dropFeedback) return node

    didChange = true
    return { ...node, data: { ...node.data, dropFeedback } }
  })

  return didChange ? nextNodes : nodes
}
