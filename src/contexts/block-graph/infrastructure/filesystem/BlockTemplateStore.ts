import {
  createExpectedAppError,
  isAppError
} from '../../../../shared-kernel/application/errors/AppError'
import { BlockTemplateLibrary } from '../../domain/aggregates/BlockTemplateLibrary'
import type { BlockTemplateLibrarySnapshot } from '../../domain/aggregates/BlockTemplateTypes'

export function parseBlockTemplateStore(
  contents: string,
  path: string
): BlockTemplateLibrarySnapshot {
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    throwInvalidStore(path)
  }

  if (!isRecord(parsed) || !('version' in parsed) || !('templates' in parsed)) {
    throwInvalidStore(path)
  }

  try {
    return BlockTemplateLibrary.restore(
      parsed as unknown as BlockTemplateLibrarySnapshot
    ).toSnapshot()
  } catch (error) {
    if (isAppError(error)) throw error
    return throwInvalidStore(path)
  }
}

export function serializeBlockTemplateStore(snapshot: BlockTemplateLibrarySnapshot): string {
  const normalized = BlockTemplateLibrary.restore(snapshot).toSnapshot()
  return `${JSON.stringify(normalized, null, 2)}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function throwInvalidStore(path: string): never {
  throw createExpectedAppError(
    'BLOCK_TEMPLATE_INVALID',
    'Block template library file is invalid.',
    { path }
  )
}
