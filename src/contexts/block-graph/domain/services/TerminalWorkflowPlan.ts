import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  defaultTerminalExecutionConfig,
  type BlockGraphSnapshot,
  type TerminalExecutionConfigSnapshot
} from '../aggregates/BlockGraphTypes'

export type TerminalWorkflowPlanScope =
  { readonly type: 'full' } | { readonly type: 'from-block'; readonly blockId: string }

interface TerminalWorkflowPlanNodeSnapshot {
  readonly blockId: string
  readonly name: string
  readonly launchCommand: string
  readonly executionConfig: TerminalExecutionConfigSnapshot
  readonly dependencyBlockIds: readonly string[]
}

export type TerminalLaunchPlanSnapshot = Pick<
  TerminalWorkflowPlanNodeSnapshot,
  'blockId' | 'launchCommand' | 'executionConfig'
>

export interface TerminalWorkflowPlanSnapshot {
  readonly graphId: string
  readonly workspaceName: string
  readonly nodes: readonly TerminalWorkflowPlanNodeSnapshot[]
}

export function buildTerminalLaunchPlan(
  graph: BlockGraphSnapshot,
  blockId: string
): TerminalLaunchPlanSnapshot {
  const block = graph.blocks.find((candidate) => candidate.id === blockId)

  if (!block) {
    throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
  }
  if (!block.launchCommand) {
    throw createExpectedAppError(
      'TERMINAL_WORKFLOW_COMMAND_MISSING',
      'The selected terminal must have a launch command.',
      { blockId }
    )
  }

  return Object.freeze({
    blockId,
    launchCommand: block.launchCommand,
    executionConfig: freezeTerminalExecutionConfig(
      block.executionConfig ?? defaultTerminalExecutionConfig
    )
  })
}

export function buildTerminalWorkflowPlan(
  graph: BlockGraphSnapshot,
  scope: TerminalWorkflowPlanScope
): TerminalWorkflowPlanSnapshot {
  const connections = graph.connections ?? []
  const blockById = new Map(graph.blocks.map((block) => [block.id, block]))
  const includedBlockIds = resolveIncludedBlockIds(graph, scope)
  const scopedConnections = connections.filter(
    (connection) =>
      includedBlockIds.has(connection.sourceBlockId) &&
      includedBlockIds.has(connection.targetBlockId)
  )

  for (const blockId of includedBlockIds) {
    const block = blockById.get(blockId)

    if (!block?.launchCommand) {
      throw createExpectedAppError(
        'TERMINAL_WORKFLOW_COMMAND_MISSING',
        'Every terminal in a workflow must have a launch command.',
        { blockId }
      )
    }
  }

  const orderedBlockIds = topologicallyOrderBlocks(
    graph.blocks.map((block) => block.id).filter((blockId) => includedBlockIds.has(blockId)),
    scopedConnections
  )
  const nodes = orderedBlockIds.map((blockId) => {
    const block = blockById.get(blockId)

    if (!block) {
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
    }

    return Object.freeze({
      blockId,
      name: block.name,
      launchCommand: block.launchCommand,
      executionConfig: freezeTerminalExecutionConfig(
        block.executionConfig ?? defaultTerminalExecutionConfig
      ),
      dependencyBlockIds: Object.freeze(
        scopedConnections
          .filter((connection) => connection.targetBlockId === blockId)
          .map((connection) => connection.sourceBlockId)
      )
    })
  })

  return Object.freeze({
    graphId: graph.id,
    workspaceName: graph.workspaceName,
    nodes: Object.freeze(nodes)
  })
}

function resolveIncludedBlockIds(
  graph: BlockGraphSnapshot,
  scope: TerminalWorkflowPlanScope
): Set<string> {
  const connections = graph.connections ?? []

  if (scope.type === 'full') {
    const connectedIds = new Set(
      connections.flatMap((connection) => [connection.sourceBlockId, connection.targetBlockId])
    )

    return new Set(
      graph.blocks
        .filter((block) => connectedIds.has(block.id) || Boolean(block.launchCommand))
        .map((block) => block.id)
    )
  }

  if (!graph.blocks.some((block) => block.id === scope.blockId)) {
    throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
  }

  const included = new Set<string>()
  const pending = [scope.blockId]

  while (pending.length > 0) {
    const blockId = pending.shift()

    if (!blockId || included.has(blockId)) {
      continue
    }

    included.add(blockId)
    pending.push(
      ...connections
        .filter((connection) => connection.sourceBlockId === blockId)
        .map((connection) => connection.targetBlockId)
    )
  }

  return included
}

function topologicallyOrderBlocks(
  stableBlockIds: readonly string[],
  connections: readonly { readonly sourceBlockId: string; readonly targetBlockId: string }[]
): string[] {
  const remainingDependencies = new Map(stableBlockIds.map((blockId) => [blockId, 0]))

  for (const connection of connections) {
    remainingDependencies.set(
      connection.targetBlockId,
      (remainingDependencies.get(connection.targetBlockId) ?? 0) + 1
    )
  }

  const ordered: string[] = []

  while (ordered.length < stableBlockIds.length) {
    const nextBlockId = stableBlockIds.find(
      (blockId) => !ordered.includes(blockId) && remainingDependencies.get(blockId) === 0
    )

    if (!nextBlockId) {
      throw createExpectedAppError('TERMINAL_WORKFLOW_CYCLE', 'Terminal workflow contains a cycle.')
    }

    ordered.push(nextBlockId)

    for (const connection of connections) {
      if (connection.sourceBlockId === nextBlockId) {
        remainingDependencies.set(
          connection.targetBlockId,
          (remainingDependencies.get(connection.targetBlockId) ?? 0) - 1
        )
      }
    }
  }

  return ordered
}

function freezeTerminalExecutionConfig(
  config: TerminalExecutionConfigSnapshot
): TerminalExecutionConfigSnapshot {
  if (config.mode === 'task') {
    return Object.freeze({
      ...config,
      successExitCodes: Object.freeze([...config.successExitCodes])
    })
  }

  return Object.freeze({
    ...config,
    ...(config.port
      ? {
          port: Object.freeze({
            ...config.port,
            binding: Object.freeze({ ...config.port.binding }),
            policy: Object.freeze({ ...config.port.policy })
          })
        }
      : {}),
    readiness: Object.freeze({ ...config.readiness })
  })
}
