import {
  createExpectedAppError,
  getAppErrorCode
} from '../../../../shared-kernel/application/errors/AppError'
import { BlockGraph } from '../../domain/aggregates/BlockGraph'
import type {
  BlockGraphSnapshot,
  QuickExecutionSlotSnapshot,
  RestorableBlockGraphSnapshot,
  TerminalExecutionConfigSnapshot
} from '../../domain/aggregates/BlockGraphTypes'
import { validateTerminalExecutionConfig } from '../../domain/services/TerminalWorkflowRules'

export interface ParsedBlockGraphStore {
  readonly graph: BlockGraphSnapshot
}

export function parseBlockGraphStore(contents: string, path: string): ParsedBlockGraphStore {
  let parsed: unknown

  try {
    parsed = JSON.parse(contents)
  } catch (error) {
    if (error instanceof SyntaxError) throwCorruptedStore(path)
    throw error
  }

  if (!isRecord(parsed)) throwCorruptedStore(path)

  if (parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4) {
    throw createExpectedAppError(
      'BLOCK_GRAPH_SNAPSHOT_VERSION_UNSUPPORTED',
      'Persisted block graph snapshot version is unsupported.',
      { path }
    )
  }

  return {
    graph: restoreGraph(parsed.graph, path, parsed.version >= 3)
  }
}

export function serializeBlockGraphStore(graph: BlockGraphSnapshot): string {
  return `${JSON.stringify({ version: 4, graph }, null, 2)}\n`
}

function restoreGraph(
  rawGraph: unknown,
  path: string,
  requiresQuickExecutionSlots: boolean
): BlockGraphSnapshot {
  try {
    const snapshot = validateGraphSnapshot(rawGraph, requiresQuickExecutionSlots)
    return BlockGraph.fromSnapshot(snapshot).toSnapshot()
  } catch (error) {
    if (getAppErrorCode(error) === 'BLOCK_GRAPH_SNAPSHOT_VERSION_UNSUPPORTED') throw error
    throwCorruptedStore(path)
  }
}

function validateGraphSnapshot(
  rawGraph: unknown,
  requiresQuickExecutionSlots: boolean
): RestorableBlockGraphSnapshot {
  if (
    !isRecord(rawGraph) ||
    typeof rawGraph.id !== 'string' ||
    typeof rawGraph.projectId !== 'string' ||
    typeof rawGraph.workspaceId !== 'string' ||
    !Array.isArray(rawGraph.blocks)
  ) {
    throw new TypeError('Invalid block graph snapshot.')
  }

  const blocks = rawGraph.blocks.map(validateTerminalBlock)
  const quickExecutionSlots = requiresQuickExecutionSlots
    ? validateQuickExecutionSlots(rawGraph.quickExecutionSlots)
    : undefined

  return {
    ...(rawGraph as unknown as RestorableBlockGraphSnapshot),
    blocks,
    quickExecutionSlots
  }
}

function validateQuickExecutionSlots(rawSlots: unknown): readonly QuickExecutionSlotSnapshot[] {
  if (!Array.isArray(rawSlots) || rawSlots.length !== 5) {
    throw new TypeError('Invalid quick execution slots.')
  }

  return rawSlots.map((rawSlot, index) => {
    const expectedNumber = index + 1
    if (
      !isRecord(rawSlot) ||
      !hasExactKeys(rawSlot, ['number', 'target']) ||
      rawSlot.number !== expectedNumber
    ) {
      throw new TypeError('Invalid quick execution slot.')
    }

    return {
      number: expectedNumber as QuickExecutionSlotSnapshot['number'],
      target: validateQuickExecutionTarget(rawSlot.target)
    }
  })
}

function validateQuickExecutionTarget(rawTarget: unknown): QuickExecutionSlotSnapshot['target'] {
  if (rawTarget === null) return null
  if (!isRecord(rawTarget)) throw new TypeError('Invalid quick execution target.')

  if (
    rawTarget.type === 'terminal' &&
    hasExactKeys(rawTarget, ['type', 'terminalBlockId']) &&
    isNonEmptyString(rawTarget.terminalBlockId)
  ) {
    return { type: 'terminal', terminalBlockId: rawTarget.terminalBlockId }
  }

  if (
    rawTarget.type === 'workflow' &&
    hasExactKeys(rawTarget, ['type', 'terminalBlockIds']) &&
    Array.isArray(rawTarget.terminalBlockIds) &&
    rawTarget.terminalBlockIds.length > 0 &&
    rawTarget.terminalBlockIds.every(isNonEmptyString) &&
    new Set(rawTarget.terminalBlockIds).size === rawTarget.terminalBlockIds.length
  ) {
    return { type: 'workflow', terminalBlockIds: [...rawTarget.terminalBlockIds] }
  }

  if (
    rawTarget.type === 'combination' &&
    hasExactKeys(rawTarget, ['type', 'terminalGroupId']) &&
    isNonEmptyString(rawTarget.terminalGroupId)
  ) {
    return { type: 'combination', terminalGroupId: rawTarget.terminalGroupId }
  }

  throw new TypeError('Invalid quick execution target.')
}

function validateTerminalBlock(rawBlock: unknown) {
  if (
    !isRecord(rawBlock) ||
    rawBlock.type !== 'terminal' ||
    typeof rawBlock.id !== 'string' ||
    typeof rawBlock.name !== 'string' ||
    typeof rawBlock.description !== 'string' ||
    !isPosition(rawBlock.position)
  ) {
    throw new TypeError('Invalid terminal block snapshot.')
  }

  if (rawBlock.executionConfig === undefined) {
    throw new TypeError('Terminal execution config is missing.')
  }

  const executionConfig = validateExecutionConfig(rawBlock.executionConfig)

  return {
    ...(rawBlock as Record<string, unknown>),
    ...(executionConfig ? { executionConfig } : {})
  } as RestorableBlockGraphSnapshot['blocks'][number]
}

function validateExecutionConfig(rawConfig: unknown): TerminalExecutionConfigSnapshot {
  if (!isRecord(rawConfig)) throw new TypeError('Invalid terminal execution config.')

  if (!hasCanonicalExecutionConfigShape(rawConfig)) {
    throw new TypeError('Invalid terminal execution config shape.')
  }

  return validateTerminalExecutionConfig(rawConfig as unknown as TerminalExecutionConfigSnapshot)
}

function hasCanonicalExecutionConfigShape(config: Record<string, unknown>): boolean {
  if (config.mode === 'task') {
    return hasExactKeys(config, ['mode', 'successExitCodes', 'timeoutMs'])
  }

  if (
    config.mode !== 'service' ||
    !hasOnlyKeys(config, ['mode', 'readiness', 'readinessTimeoutMs', 'port']) ||
    !hasCanonicalReadinessShape(config.readiness)
  ) {
    return false
  }

  return config.port === undefined || hasCanonicalPortIntentShape(config.port)
}

function hasCanonicalReadinessShape(readiness: unknown): boolean {
  if (!isRecord(readiness)) return false
  if (readiness.type === 'tcp') return hasExactKeys(readiness, ['type'])
  return readiness.type === 'output' && hasExactKeys(readiness, ['type', 'text'])
}

function hasCanonicalPortIntentShape(port: unknown): boolean {
  if (
    !isRecord(port) ||
    !hasExactKeys(port, ['protocol', 'policy', 'binding']) ||
    !isRecord(port.policy) ||
    !isRecord(port.binding)
  ) {
    return false
  }

  const policyValid =
    (port.policy.type === 'auto' && hasExactKeys(port.policy, ['type'])) ||
    ((port.policy.type === 'fixed' || port.policy.type === 'preferred') &&
      hasExactKeys(port.policy, ['type', 'port']))
  const bindingValid =
    (port.binding.type === 'none' && hasExactKeys(port.binding, ['type'])) ||
    (port.binding.type === 'environment' && hasExactKeys(port.binding, ['type', 'variableName'])) ||
    (port.binding.type === 'argument' && hasExactKeys(port.binding, ['type', 'template']))

  return policyValid && bindingValid
}

function isPosition(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  )
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length && hasOnlyKeys(record, keys)
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowedKeys = new Set(keys)
  return Object.keys(record).every((key) => allowedKeys.has(key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function throwCorruptedStore(path: string): never {
  throw createExpectedAppError(
    'BLOCK_GRAPH_SNAPSHOT_CORRUPTED',
    'Persisted block graph snapshot is corrupted.',
    { path }
  )
}
