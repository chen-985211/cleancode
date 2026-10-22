import type {
  BlockPositionSnapshot,
  CreateTerminalBlockInput,
  CreateTerminalGroupInput,
  ConnectTerminalBlocksInput,
  TerminalBlockSnapshot,
  TerminalGroupSnapshot,
  TerminalConnectionSnapshot,
  UpdateTerminalDefinitionInput
} from '../aggregates/BlockGraphTypes'
import type {
  BlockTemplateSnapshot,
  InstantiatedBlockTemplateSnapshot
} from '../aggregates/BlockTemplateTypes'
import { normalizeBlockTemplate } from './BlockTemplateProjection'

interface TemplateInstanceEditor {
  createTerminalBlock(input: CreateTerminalBlockInput): TerminalBlockSnapshot
  updateTerminalDefinition(blockId: string, input: UpdateTerminalDefinitionInput): void
  connectTerminalBlocks(input: ConnectTerminalBlocksInput): TerminalConnectionSnapshot
  createTerminalGroup(input: CreateTerminalGroupInput, layout: 'preserve'): TerminalGroupSnapshot
}

export function instantiateBlockTemplate(
  graph: TemplateInstanceEditor,
  sourceTemplate: BlockTemplateSnapshot,
  origin: BlockPositionSnapshot
): InstantiatedBlockTemplateSnapshot {
  const template = normalizeBlockTemplate(sourceTemplate)
  const blockIdByTemplateNodeId = new Map<string, string>()

  for (const node of template.nodes) {
    const block = graph.createTerminalBlock({
      name: node.name,
      description: node.description,
      launchCommand: node.launchCommand,
      position: {
        x: origin.x + node.position.x,
        y: origin.y + node.position.y
      },
      size: node.size
    })
    graph.updateTerminalDefinition(block.id, {
      name: node.name,
      description: node.description,
      launchCommand: node.launchCommand,
      executionConfig: node.executionConfig
    })
    blockIdByTemplateNodeId.set(node.templateNodeId, block.id)
  }

  for (const connection of template.connections) {
    graph.connectTerminalBlocks({
      sourceBlockId: blockIdByTemplateNodeId.get(connection.sourceTemplateNodeId)!,
      targetBlockId: blockIdByTemplateNodeId.get(connection.targetTemplateNodeId)!
    })
  }

  const blockIds = template.nodes.map((node) => blockIdByTemplateNodeId.get(node.templateNodeId)!)
  const terminalGroup =
    template.type === 'combination'
      ? graph.createTerminalGroup({ name: template.name, memberBlockIds: blockIds }, 'preserve')
      : null

  return Object.freeze({
    blockIds: Object.freeze(blockIds),
    terminalGroupId: terminalGroup?.id ?? null,
    executionScope: terminalGroup
      ? Object.freeze({
          terminalGroupId: terminalGroup.id,
          type: 'terminal-group' as const
        })
      : Object.freeze({ blockIds: Object.freeze([...blockIds]), type: 'block-set' as const })
  })
}
