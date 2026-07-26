import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  createCanvasObjectIdentity,
  createCanvasObjectIdentityKey,
  type CanvasObjectIdentity
} from '../../../../shared-kernel/domain/value-objects/CanvasObjectIdentity'

export type TerminalOwnerRef =
  { readonly id: string; readonly kind: 'block' } | { readonly id: string; readonly kind: 'agent' }

export interface TerminalRunOwner {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly blockId: string
  /** Explicit for new scopes; absent snapshots are legacy block-owned terminals. */
  readonly owner?: TerminalOwnerRef
}

export interface TerminalRunScope extends TerminalRunOwner {
  readonly sessionId: string
  readonly runId: string
  readonly generation: number
}

export function createTerminalRunScope(input: TerminalRunScope): TerminalRunScope {
  return Object.freeze({ ...input, owner: Object.freeze(resolveTerminalOwnerRef(input)) })
}

export function createTerminalRunSlotKey(owner: TerminalRunOwner): string {
  return createCanvasObjectIdentityKey(toTerminalCanvasObjectIdentity(owner))
}

function toTerminalCanvasObjectIdentity(owner: TerminalRunOwner): CanvasObjectIdentity {
  const ownerRef = resolveTerminalOwnerRef(owner)

  return createCanvasObjectIdentity({
    projectId: owner.projectId,
    workspaceId: owner.workspaceId,
    objectKind: ownerRef.kind === 'block' ? 'terminal' : 'agent',
    objectId: ownerRef.id
  })
}

export function resolveTerminalOwnerRef(owner: TerminalRunOwner): TerminalOwnerRef {
  const ownerRef = owner.owner ?? { id: owner.blockId, kind: 'block' as const }
  const id = ownerRef.id.trim()
  if (!id) {
    throw createExpectedAppError('TERMINAL_OWNER_INVALID', 'Terminal owner id cannot be empty.')
  }
  return { id, kind: ownerRef.kind }
}

export function isBlockTerminalOwner(owner: TerminalRunOwner): boolean {
  return resolveTerminalOwnerRef(owner).kind === 'block'
}

export function isSameTerminalRun(
  left: Pick<TerminalRunScope, 'sessionId' | 'runId' | 'generation'>,
  right: Pick<TerminalRunScope, 'sessionId' | 'runId' | 'generation'>
): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.runId === right.runId &&
    left.generation === right.generation
  )
}
