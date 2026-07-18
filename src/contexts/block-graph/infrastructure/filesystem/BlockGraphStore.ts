import {
  createExpectedAppError,
  getAppErrorCode
} from '../../../../shared-kernel/application/errors/AppError'
import { BlockGraph } from '../../domain/aggregates/BlockGraph'
import type {
  BlockGraphSnapshot,
  RestorableBlockGraphSnapshot,
  TerminalExecutionConfigSnapshot
} from '../../domain/aggregates/BlockGraphTypes'
import { validateTerminalExecutionConfig } from '../../domain/services/TerminalWorkflowRules'

export interface ParsedBlockGraphStore {
  readonly graph: BlockGraphSnapshot
  readonly requiresMigration: boolean
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

  if ('version' in parsed) {
    if (parsed.version !== 1) {
      throw createExpectedAppError(
        'BLOCK_GRAPH_SNAPSHOT_VERSION_UNSUPPORTED',
        'Persisted block graph snapshot version is unsupported.',
        { path }
      )
    }

    return {
      graph: restoreGraph(parsed.graph, path, false),
      requiresMigration: false
    }
  }

  return {
    graph: restoreGraph(parsed, path, true),
    requiresMigration: true
  }
}

export function serializeBlockGraphStore(graph: BlockGraphSnapshot): string {
  return `${JSON.stringify({ version: 1, graph }, null, 2)}\n`
}

function restoreGraph(rawGraph: unknown, path: string, isLegacy: boolean): BlockGraphSnapshot {
  try {
    const snapshot = migrateGraphSnapshot(rawGraph, isLegacy)
    return BlockGraph.fromSnapshot(snapshot).toSnapshot()
  } catch (error) {
    if (getAppErrorCode(error) === 'BLOCK_GRAPH_SNAPSHOT_VERSION_UNSUPPORTED') throw error
    throwCorruptedStore(path)
  }
}

function migrateGraphSnapshot(rawGraph: unknown, isLegacy: boolean): RestorableBlockGraphSnapshot {
  if (
    !isRecord(rawGraph) ||
    typeof rawGraph.id !== 'string' ||
    typeof rawGraph.projectId !== 'string' ||
    typeof rawGraph.workspaceName !== 'string' ||
    !Array.isArray(rawGraph.blocks)
  ) {
    throw new TypeError('Invalid block graph snapshot.')
  }

  const blocks = rawGraph.blocks.map((rawBlock) => migrateTerminalBlock(rawBlock, isLegacy))

  return {
    ...(rawGraph as unknown as RestorableBlockGraphSnapshot),
    blocks
  }
}

function migrateTerminalBlock(rawBlock: unknown, isLegacy: boolean) {
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

  if (!isLegacy && rawBlock.executionConfig === undefined) {
    throw new TypeError('Version 1 terminal execution config is missing.')
  }

  const executionConfig = migrateTerminalExecutionConfig(rawBlock.executionConfig, isLegacy)

  return {
    ...(rawBlock as Record<string, unknown>),
    ...(executionConfig ? { executionConfig } : {})
  } as RestorableBlockGraphSnapshot['blocks'][number]
}

function migrateTerminalExecutionConfig(
  rawConfig: unknown,
  isLegacy: boolean
): TerminalExecutionConfigSnapshot | undefined {
  if (rawConfig === undefined && isLegacy) return undefined
  if (!isRecord(rawConfig)) throw new TypeError('Invalid terminal execution config.')

  const migrated = isLegacy ? migrateLegacyTcpReadiness(rawConfig) : rawConfig

  if (!hasCanonicalExecutionConfigShape(migrated)) {
    throw new TypeError('Invalid terminal execution config shape.')
  }

  return validateTerminalExecutionConfig(migrated as unknown as TerminalExecutionConfigSnapshot)
}

function migrateLegacyTcpReadiness(config: Record<string, unknown>): Record<string, unknown> {
  if (
    config.mode !== 'service' ||
    'port' in config ||
    !isRecord(config.readiness) ||
    config.readiness.type !== 'tcp' ||
    typeof config.readiness.port !== 'number'
  ) {
    return config
  }

  return {
    mode: 'service',
    port: {
      binding: { type: 'none' },
      policy: { port: config.readiness.port, type: 'fixed' },
      protocol: 'tcp'
    },
    readiness: { type: 'tcp' },
    readinessTimeoutMs: config.readinessTimeoutMs
  }
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

function throwCorruptedStore(path: string): never {
  throw createExpectedAppError(
    'BLOCK_GRAPH_SNAPSHOT_CORRUPTED',
    'Persisted block graph snapshot is corrupted.',
    { path }
  )
}
