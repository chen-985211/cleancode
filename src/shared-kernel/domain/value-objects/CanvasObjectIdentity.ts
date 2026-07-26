import { createExpectedAppError } from '../../application/errors/AppError'

type CanvasObjectKind = 'terminal' | 'terminal-group' | 'agent'

export interface CanvasObjectIdentity {
  readonly projectId: string
  readonly workspaceId: string
  readonly objectKind: CanvasObjectKind
  readonly objectId: string
}

export function createCanvasObjectIdentity(input: CanvasObjectIdentity): CanvasObjectIdentity {
  return Object.freeze({
    projectId: requireIdentityPart(input.projectId, 'projectId'),
    workspaceId: requireIdentityPart(input.workspaceId, 'workspaceId'),
    objectKind: input.objectKind,
    objectId: requireIdentityPart(input.objectId, 'objectId')
  })
}

export function createCanvasObjectIdentityKey(identity: CanvasObjectIdentity): string {
  const normalized = createCanvasObjectIdentity(identity)

  return JSON.stringify([
    normalized.projectId,
    normalized.workspaceId,
    normalized.objectKind,
    normalized.objectId
  ])
}

function requireIdentityPart(value: string, fieldName: string): string {
  const normalized = value.trim()

  if (!normalized) {
    throw createExpectedAppError(
      'INVALID_CANVAS_OBJECT_IDENTITY',
      `Canvas object identity ${fieldName} cannot be empty.`,
      { fieldName }
    )
  }

  return normalized
}
