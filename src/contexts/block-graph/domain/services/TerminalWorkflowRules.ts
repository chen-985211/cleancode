import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  defaultTerminalExecutionConfig,
  type ConnectTerminalBlocksInput,
  type TerminalBlockSnapshot,
  type TerminalConnectionSnapshot,
  type TerminalExecutionConfigSnapshot
} from '../aggregates/BlockGraphTypes'

export interface AddTerminalConnectionResult {
  readonly connection: TerminalConnectionSnapshot
  readonly connections: readonly TerminalConnectionSnapshot[]
}

export function addTerminalConnection(
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly TerminalConnectionSnapshot[],
  input: ConnectTerminalBlocksInput,
  createId: () => string
): AddTerminalConnectionResult {
  requireTerminalBlock(blocks, input.sourceBlockId)
  requireTerminalBlock(blocks, input.targetBlockId)

  if (input.sourceBlockId === input.targetBlockId) {
    throw createExpectedAppError(
      'TERMINAL_CONNECTION_INVALID',
      'A terminal cannot depend on itself.'
    )
  }

  if (
    connections.some(
      (connection) =>
        connection.sourceBlockId === input.sourceBlockId &&
        connection.targetBlockId === input.targetBlockId
    )
  ) {
    throw createExpectedAppError(
      'TERMINAL_CONNECTION_DUPLICATE',
      'Terminal connection already exists.'
    )
  }

  if (wouldCreateTerminalWorkflowCycle(connections, input.sourceBlockId, input.targetBlockId)) {
    throw createExpectedAppError(
      'TERMINAL_WORKFLOW_CYCLE',
      'Terminal connection would create a workflow cycle.'
    )
  }

  const connection = {
    id: input.id ?? createId(),
    sourceBlockId: input.sourceBlockId,
    targetBlockId: input.targetBlockId
  }

  return { connection, connections: [...connections, connection] }
}

export function removeTerminalConnection(
  connections: readonly TerminalConnectionSnapshot[],
  connectionId: string
): readonly TerminalConnectionSnapshot[] {
  const remainingConnections = connections.filter((connection) => connection.id !== connectionId)

  if (remainingConnections.length === connections.length) {
    throw createExpectedAppError(
      'TERMINAL_CONNECTION_NOT_FOUND',
      'Terminal connection was not found.'
    )
  }

  return remainingConnections
}

export function validateTerminalExecutionConfig(
  config: TerminalExecutionConfigSnapshot
): TerminalExecutionConfigSnapshot {
  if (config.mode === 'task') {
    const successExitCodes = [...new Set(config.successExitCodes)]
    const hasInvalidExitCode = successExitCodes.some(
      (code) => !Number.isInteger(code) || code < 0 || code > 255
    )

    if (
      successExitCodes.length === 0 ||
      hasInvalidExitCode ||
      !isOptionalPositiveInteger(config.timeoutMs)
    ) {
      throwInvalidExecutionConfig()
    }

    return { mode: 'task', successExitCodes, timeoutMs: config.timeoutMs }
  }

  if (!isPositiveInteger(config.readinessTimeoutMs)) {
    throwInvalidExecutionConfig()
  }

  if (config.readiness.type === 'output') {
    const text = config.readiness.text.trim()

    if (!text) {
      throwInvalidExecutionConfig()
    }

    return {
      mode: 'service',
      readiness: { type: 'output', text },
      readinessTimeoutMs: config.readinessTimeoutMs
    }
  }

  if (!isPositiveInteger(config.readiness.port) || config.readiness.port > 65_535) {
    throwInvalidExecutionConfig()
  }

  return {
    mode: 'service',
    readiness: { type: 'tcp', port: config.readiness.port },
    readinessTimeoutMs: config.readinessTimeoutMs
  }
}

export function normalizeRestoredTerminalExecutionConfig(
  config: TerminalExecutionConfigSnapshot | undefined
): TerminalExecutionConfigSnapshot {
  if (!config) {
    return defaultTerminalExecutionConfig
  }

  try {
    return validateTerminalExecutionConfig(config)
  } catch {
    return defaultTerminalExecutionConfig
  }
}

export function normalizeRestoredTerminalConnections(
  connections: readonly Partial<TerminalConnectionSnapshot>[] | undefined,
  blocks: readonly TerminalBlockSnapshot[]
): TerminalConnectionSnapshot[] {
  const blockIds = new Set(blocks.map((block) => block.id))
  const restored: TerminalConnectionSnapshot[] = []

  for (const connection of connections ?? []) {
    if (
      typeof connection.id !== 'string' ||
      typeof connection.sourceBlockId !== 'string' ||
      typeof connection.targetBlockId !== 'string' ||
      connection.sourceBlockId === connection.targetBlockId ||
      !blockIds.has(connection.sourceBlockId) ||
      !blockIds.has(connection.targetBlockId) ||
      restored.some(
        (candidate) =>
          candidate.sourceBlockId === connection.sourceBlockId &&
          candidate.targetBlockId === connection.targetBlockId
      ) ||
      wouldCreateTerminalWorkflowCycle(restored, connection.sourceBlockId, connection.targetBlockId)
    ) {
      continue
    }

    restored.push(connection as TerminalConnectionSnapshot)
  }

  return restored
}

function wouldCreateTerminalWorkflowCycle(
  connections: readonly TerminalConnectionSnapshot[],
  sourceBlockId: string,
  targetBlockId: string
): boolean {
  const outgoing = new Map<string, string[]>()

  for (const connection of connections) {
    outgoing.set(connection.sourceBlockId, [
      ...(outgoing.get(connection.sourceBlockId) ?? []),
      connection.targetBlockId
    ])
  }

  const pending = [targetBlockId]
  const visited = new Set<string>()

  while (pending.length > 0) {
    const blockId = pending.pop()

    if (!blockId || visited.has(blockId)) {
      continue
    }
    if (blockId === sourceBlockId) {
      return true
    }

    visited.add(blockId)
    pending.push(...(outgoing.get(blockId) ?? []))
  }

  return false
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

function isOptionalPositiveInteger(value: number | null): boolean {
  return value === null || isPositiveInteger(value)
}

function throwInvalidExecutionConfig(): never {
  throw createExpectedAppError(
    'TERMINAL_EXECUTION_CONFIG_INVALID',
    'Terminal execution configuration is invalid.'
  )
}

function requireTerminalBlock(blocks: readonly TerminalBlockSnapshot[], blockId: string): void {
  if (!blocks.some((block) => block.id === blockId)) {
    throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
  }
}
