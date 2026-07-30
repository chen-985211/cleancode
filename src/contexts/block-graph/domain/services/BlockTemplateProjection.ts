import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  BlockTemplateConnectionSnapshot,
  BlockTemplateNodeSnapshot,
  BlockTemplateScope,
  BlockTemplateSnapshot,
  BlockTemplateType
} from '../aggregates/BlockTemplateTypes'
import {
  defaultTerminalExecutionConfig,
  type BlockGraphSnapshot,
  type TerminalExecutionConfigSnapshot
} from '../aggregates/BlockGraphTypes'
import { normalizeTerminalDefinition } from './TerminalDefinitionRules'

interface CreateBlockTemplateInput {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly scope: BlockTemplateScope
  readonly createdAt: string
  readonly graph: BlockGraphSnapshot
  readonly selectedBlockIds: readonly string[]
}

export function createBlockTemplate(input: CreateBlockTemplateInput): BlockTemplateSnapshot {
  const selectedBlockIdSet = new Set(input.selectedBlockIds)
  const selectedBlocks = input.graph.blocks.filter((block) => selectedBlockIdSet.has(block.id))

  if (selectedBlocks.length === 0 || selectedBlocks.length !== selectedBlockIdSet.size) {
    invalidTemplate('The template selection must contain existing terminal blocks.')
  }

  const sourceIdToTemplateId = new Map(
    selectedBlocks.map((block, index) => [block.id, `template-node-${index + 1}`])
  )
  const minimumX = Math.min(...selectedBlocks.map((block) => block.position.x))
  const minimumY = Math.min(...selectedBlocks.map((block) => block.position.y))
  const nodes = selectedBlocks.map((block) => {
    const definition = normalizeTerminalDefinition({
      name: block.name,
      description: block.description,
      launchCommand: block.launchCommand,
      executionConfig: block.executionConfig ?? defaultTerminalExecutionConfig
    })

    return {
      templateNodeId: sourceIdToTemplateId.get(block.id)!,
      ...definition,
      executionConfig: cloneExecutionConfig(definition.executionConfig),
      position: {
        x: block.position.x - minimumX,
        y: block.position.y - minimumY
      },
      size: { ...block.size }
    }
  })
  const connections = (input.graph.connections ?? []).flatMap((connection) => {
    const sourceTemplateNodeId = sourceIdToTemplateId.get(connection.sourceBlockId)
    const targetTemplateNodeId = sourceIdToTemplateId.get(connection.targetBlockId)

    return sourceTemplateNodeId && targetTemplateNodeId
      ? [{ sourceTemplateNodeId, targetTemplateNodeId }]
      : []
  })

  return normalizeBlockTemplate({
    id: input.id,
    type: recognizeBlockTemplateType(nodes, connections),
    name: input.name,
    description: input.description,
    scope: input.scope,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    nodes,
    connections
  })
}

export function normalizeBlockTemplate(template: BlockTemplateSnapshot): BlockTemplateSnapshot {
  const id = normalizeRequiredText(template.id, 'Template id cannot be empty.')
  const name = normalizeRequiredText(template.name, 'Template name cannot be empty.')
  const description = template.description.trim()
  const scope = normalizeScope(template.scope)
  const createdAt = normalizeRequiredText(
    template.createdAt,
    'Template creation time cannot be empty.'
  )
  const updatedAt = normalizeRequiredText(
    template.updatedAt,
    'Template update time cannot be empty.'
  )

  if (!Array.isArray(template.nodes) || template.nodes.length === 0) {
    invalidTemplate('A block template must contain at least one terminal.')
  }

  const templateNodeIds = new Set<string>()
  const nodes = template.nodes.map((node) => {
    const templateNodeId = normalizeRequiredText(
      node.templateNodeId,
      'Template node id cannot be empty.'
    )

    if (templateNodeIds.has(templateNodeId)) {
      invalidTemplate('Template node ids must be unique.')
    }
    templateNodeIds.add(templateNodeId)
    const definition = normalizeTerminalDefinition({
      name: node.name,
      description: node.description,
      launchCommand: node.launchCommand,
      executionConfig: node.executionConfig
    })

    return Object.freeze({
      templateNodeId,
      ...definition,
      executionConfig: freezeExecutionConfig(definition.executionConfig),
      position: Object.freeze(normalizePosition(node.position)),
      size: Object.freeze(normalizeSize(node.size))
    })
  })
  const connectionKeys = new Set<string>()
  const connections = template.connections.map((connection) => {
    const sourceTemplateNodeId = normalizeRequiredText(
      connection.sourceTemplateNodeId,
      'Template connection source cannot be empty.'
    )
    const targetTemplateNodeId = normalizeRequiredText(
      connection.targetTemplateNodeId,
      'Template connection target cannot be empty.'
    )

    if (
      sourceTemplateNodeId === targetTemplateNodeId ||
      !templateNodeIds.has(sourceTemplateNodeId) ||
      !templateNodeIds.has(targetTemplateNodeId)
    ) {
      invalidTemplate('Template connections must reference two different template nodes.')
    }
    const key = `${sourceTemplateNodeId}\0${targetTemplateNodeId}`
    if (connectionKeys.has(key)) {
      invalidTemplate('Template connections must be unique.')
    }
    connectionKeys.add(key)

    return Object.freeze({ sourceTemplateNodeId, targetTemplateNodeId })
  })

  assertAcyclic(nodes, connections)
  const recognizedType = recognizeBlockTemplateType(nodes, connections)
  if (recognizedType !== template.type) {
    invalidTemplate('Template type does not match its terminal dependency graph.')
  }

  return Object.freeze({
    id,
    type: template.type,
    name,
    description,
    scope,
    createdAt,
    updatedAt,
    nodes: Object.freeze(nodes),
    connections: Object.freeze(connections)
  })
}

function recognizeBlockTemplateType(
  nodes: readonly Pick<BlockTemplateNodeSnapshot, 'templateNodeId'>[],
  connections: readonly BlockTemplateConnectionSnapshot[]
): BlockTemplateType {
  if (nodes.length === 1) {
    return 'terminal'
  }
  if (connections.length === 0) {
    return 'combination'
  }

  const adjacent = new Map(nodes.map((node) => [node.templateNodeId, new Set<string>()]))
  for (const connection of connections) {
    adjacent.get(connection.sourceTemplateNodeId)?.add(connection.targetTemplateNodeId)
    adjacent.get(connection.targetTemplateNodeId)?.add(connection.sourceTemplateNodeId)
  }
  const visited = new Set<string>()
  const pending = [nodes[0]!.templateNodeId]

  while (pending.length > 0) {
    const nodeId = pending.shift()
    if (!nodeId || visited.has(nodeId)) continue
    visited.add(nodeId)
    pending.push(...(adjacent.get(nodeId) ?? []))
  }

  return visited.size === nodes.length ? 'workflow' : 'combination'
}

function assertAcyclic(
  nodes: readonly Pick<BlockTemplateNodeSnapshot, 'templateNodeId'>[],
  connections: readonly BlockTemplateConnectionSnapshot[]
): void {
  const indegrees = new Map(nodes.map((node) => [node.templateNodeId, 0]))
  for (const connection of connections) {
    indegrees.set(
      connection.targetTemplateNodeId,
      (indegrees.get(connection.targetTemplateNodeId) ?? 0) + 1
    )
  }
  const pending = [...indegrees].filter(([, count]) => count === 0).map(([nodeId]) => nodeId)
  let visitedCount = 0

  while (pending.length > 0) {
    const nodeId = pending.shift()!
    visitedCount += 1
    for (const connection of connections) {
      if (connection.sourceTemplateNodeId !== nodeId) continue
      const remaining = (indegrees.get(connection.targetTemplateNodeId) ?? 0) - 1
      indegrees.set(connection.targetTemplateNodeId, remaining)
      if (remaining === 0) pending.push(connection.targetTemplateNodeId)
    }
  }

  if (visitedCount !== nodes.length) {
    invalidTemplate('Block template contains a dependency cycle.')
  }
}

function normalizeScope(scope: BlockTemplateScope): BlockTemplateScope {
  if (scope.type === 'global') {
    return Object.freeze({ type: 'global' })
  }

  return Object.freeze({
    projectId: normalizeRequiredText(
      scope.projectId,
      'Project template scope requires a project id.'
    ),
    type: 'project'
  })
}

function normalizePosition(position: { readonly x: number; readonly y: number }) {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    invalidTemplate('Template node position must be finite.')
  }
  return { x: position.x, y: position.y }
}

function normalizeSize(size: { readonly width: number; readonly height: number }) {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    invalidTemplate('Template node size must be positive.')
  }
  return { width: size.width, height: size.height }
}

function normalizeRequiredText(value: string, message: string): string {
  const normalized = value.trim()
  if (!normalized) invalidTemplate(message)
  return normalized
}

function cloneExecutionConfig(
  executionConfig: TerminalExecutionConfigSnapshot
): TerminalExecutionConfigSnapshot {
  return executionConfig.mode === 'task'
    ? { ...executionConfig, successExitCodes: [...executionConfig.successExitCodes] }
    : {
        ...executionConfig,
        ...(executionConfig.port
          ? {
              port: {
                ...executionConfig.port,
                binding: { ...executionConfig.port.binding },
                policy: { ...executionConfig.port.policy }
              }
            }
          : {}),
        readiness: { ...executionConfig.readiness }
      }
}

function freezeExecutionConfig(
  executionConfig: TerminalExecutionConfigSnapshot
): TerminalExecutionConfigSnapshot {
  const cloned = cloneExecutionConfig(executionConfig)
  if (cloned.mode === 'task') {
    return Object.freeze({
      ...cloned,
      successExitCodes: Object.freeze([...cloned.successExitCodes])
    })
  }

  return Object.freeze({
    ...cloned,
    ...(cloned.port
      ? {
          port: Object.freeze({
            ...cloned.port,
            binding: Object.freeze({ ...cloned.port.binding }),
            policy: Object.freeze({ ...cloned.port.policy })
          })
        }
      : {}),
    readiness: Object.freeze({ ...cloned.readiness })
  })
}

function invalidTemplate(message: string): never {
  throw createExpectedAppError('BLOCK_TEMPLATE_INVALID', message)
}
