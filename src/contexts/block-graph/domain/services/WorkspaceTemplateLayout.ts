import type { BlockTemplateSnapshot } from '../aggregates/BlockTemplateTypes'
import { createTerminalFlowRowLayouts } from './TerminalDependencyLayout'
import { terminalExpansionSize } from './TerminalExpansionSize'

// Placement and instantiation both consume the prepared copy of a workspace template.
export function resolveWorkspaceTemplateLayout(
  template: BlockTemplateSnapshot
): BlockTemplateSnapshot {
  if (!template.connections.length) return template
  const connections = template.connections.map((edge) => ({
    sourceBlockId: edge.sourceTemplateNodeId,
    targetBlockId: edge.targetTemplateNodeId
  }))
  const blocks = template.nodes.map((node) => {
    const block = { ...node, type: 'terminal' as const, id: node.templateNodeId }
    return { ...block, size: terminalExpansionSize(block, connections) }
  })
  const converted = blocks.filter((block, index) => block.size !== template.nodes[index].size)
  if (!converted.length) return template

  const positions = new Map(
    (template.type === 'combination' && converted.some((block) => block.isCollapsed === undefined)
      ? createTerminalFlowRowLayouts(blocks, connections)
      : []
    ).map((layout) => [layout.blockId, layout.position])
  )
  return {
    ...template,
    nodes: template.nodes.map((node, index) => ({
      ...node,
      size: blocks[index].size,
      position: positions.get(node.templateNodeId) ?? node.position
    }))
  }
}
