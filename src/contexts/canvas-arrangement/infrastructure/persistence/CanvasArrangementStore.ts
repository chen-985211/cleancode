import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  CanvasArrangementItemReference,
  CanvasArrangementSnapshot,
  CanvasStackSnapshot
} from '../../application/dto/CanvasArrangementSnapshot'
import { CanvasArrangement } from '../../domain/aggregates/CanvasArrangement'

export function parseCanvasArrangementStore(
  contents: string,
  path: string
): CanvasArrangementSnapshot {
  let parsed: unknown

  try {
    parsed = JSON.parse(contents)
  } catch (error) {
    if (error instanceof SyntaxError) corrupted(path)
    throw error
  }

  if (!isRecord(parsed) || !hasExactKeys(parsed, ['version', 'arrangement'])) {
    corrupted(path)
  }
  if (parsed.version !== 1) {
    throw createExpectedAppError(
      'CANVAS_ARRANGEMENT_VERSION_UNSUPPORTED',
      'Unsupported canvas arrangement store version.',
      { path }
    )
  }

  try {
    return CanvasArrangement.fromSnapshot(validateArrangement(parsed.arrangement)).toSnapshot()
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'CANVAS_ARRANGEMENT_VERSION_UNSUPPORTED'
    ) {
      throw error
    }
    corrupted(path)
  }
}

export function serializeCanvasArrangementStore(snapshot: CanvasArrangementSnapshot): string {
  return `${JSON.stringify({ version: 1, arrangement: snapshot }, null, 2)}\n`
}

function validateArrangement(value: unknown): CanvasArrangementSnapshot {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['projectId', 'workspaceId', 'stacks']) ||
    !isNonEmptyString(value.projectId) ||
    !isNonEmptyString(value.workspaceId) ||
    !Array.isArray(value.stacks)
  ) {
    throw new TypeError('Invalid canvas arrangement snapshot.')
  }

  return {
    projectId: value.projectId,
    workspaceId: value.workspaceId,
    stacks: value.stacks.map(validateStack)
  }
}

function validateStack(value: unknown): CanvasStackSnapshot {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['id', 'anchor', 'items']) ||
    !isNonEmptyString(value.id) ||
    !isPosition(value.anchor) ||
    !Array.isArray(value.items)
  ) {
    throw new TypeError('Invalid canvas stack snapshot.')
  }
  return { id: value.id, anchor: value.anchor, items: value.items.map(validateItem) }
}

function validateItem(value: unknown): CanvasArrangementItemReference {
  if (!isRecord(value)) throw new TypeError('Invalid canvas arrangement item.')

  if (
    value.kind === 'terminal' &&
    hasExactKeys(value, ['kind', 'terminalId']) &&
    isNonEmptyString(value.terminalId)
  ) {
    return { kind: value.kind, terminalId: value.terminalId }
  }
  if (
    value.kind === 'workflow' &&
    hasExactKeys(value, ['kind', 'terminalIds']) &&
    Array.isArray(value.terminalIds) &&
    value.terminalIds.every(isNonEmptyString)
  ) {
    return { kind: value.kind, terminalIds: value.terminalIds }
  }
  if (
    value.kind === 'combination' &&
    hasExactKeys(value, ['kind', 'terminalGroupId']) &&
    isNonEmptyString(value.terminalGroupId)
  ) {
    return { kind: value.kind, terminalGroupId: value.terminalGroupId }
  }
  if (
    value.kind === 'agent' &&
    hasExactKeys(value, ['kind', 'agentId']) &&
    isNonEmptyString(value.agentId)
  ) {
    return { kind: value.kind, agentId: value.agentId }
  }

  throw new TypeError('Invalid canvas arrangement item.')
}

function isPosition(value: unknown): value is { readonly x: number; readonly y: number } {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['x', 'y']) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  )
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowedKeys = new Set(keys)
  return (
    Object.keys(record).length === keys.length &&
    Object.keys(record).every((key) => allowedKeys.has(key))
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function corrupted(path: string): never {
  throw createExpectedAppError(
    'CANVAS_ARRANGEMENT_CORRUPTED',
    'Persisted canvas arrangement is corrupted.',
    { path }
  )
}
