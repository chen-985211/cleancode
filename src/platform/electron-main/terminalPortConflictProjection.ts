import type {
  TerminalRunEvent,
  TerminalRunIdentity,
  TerminalServicePortConflict
} from '../../contexts/run/application/dto/TerminalRunEvent'
import type { AppErrorDetails } from '../../shared-kernel/application/errors/AppError'
import type {
  ManagedServiceOwnerReference,
  ManagedServiceOwnerResolver
} from './managedServiceOwnerResolver'

interface PortConflictFailure {
  readonly code: string
  readonly details?: AppErrorDetails
}

export async function projectTerminalPortConflict(
  failure: PortConflictFailure,
  resolveManagedOwner: ManagedServiceOwnerResolver | undefined,
  onOwnerResolutionError?: (error: unknown) => void
): Promise<Extract<TerminalRunEvent, { readonly type: 'service-port-conflict' }> | null> {
  if (!isPortConflictCode(failure.code)) return null
  const scope = readAttemptedRunIdentity(failure.details)
  if (!scope) return null

  const ownerReference = readManagedOwnerReference(failure.details)
  let managedOwner = null
  if (ownerReference && resolveManagedOwner) {
    try {
      managedOwner = await resolveManagedOwner(ownerReference)
    } catch (error) {
      onOwnerResolutionError?.(error)
    }
  }

  return {
    type: 'service-port-conflict',
    scope,
    conflict: {
      code: failure.code,
      port: readNumber(failure.details, 'port') ?? 0,
      ownership: ownerReference
        ? 'managed'
        : failure.code === 'SERVICE_LISTENER_OWNERSHIP_UNVERIFIED' ||
            failure.code === 'SERVICE_PORT_ALLOCATION_EXHAUSTED'
          ? 'unknown'
          : 'external',
      managedOwner
    }
  }
}

function isPortConflictCode(code: string): code is TerminalServicePortConflict['code'] {
  return (
    code === 'SERVICE_PORT_FIXED_CONFLICT' ||
    code === 'SERVICE_PORT_ALLOCATION_EXHAUSTED' ||
    code === 'SERVICE_LISTENER_OWNERSHIP_MISMATCH' ||
    code === 'SERVICE_LISTENER_OWNERSHIP_UNVERIFIED'
  )
}

function readAttemptedRunIdentity(
  details: AppErrorDetails | undefined
): TerminalRunIdentity | null {
  const identity = {
    projectId: readString(details, 'attemptedProjectId'),
    workspaceName: readString(details, 'attemptedWorkspaceName'),
    blockId: readString(details, 'attemptedBlockId'),
    sessionId: readString(details, 'attemptedSessionId'),
    runId: readString(details, 'attemptedRunId'),
    generation: readNumber(details, 'attemptedGeneration')
  }
  return Object.values(identity).every((value) => value !== null)
    ? (identity as TerminalRunIdentity)
    : null
}

function readManagedOwnerReference(
  details: AppErrorDetails | undefined
): ManagedServiceOwnerReference | null {
  const identity = {
    projectId: readString(details, 'managedProjectId'),
    projectDirectory: readString(details, 'managedProjectDirectory'),
    workspaceName: readString(details, 'managedWorkspaceName'),
    blockId: readString(details, 'managedBlockId'),
    sessionId: readString(details, 'managedSessionId'),
    runId: readString(details, 'managedRunId'),
    generation: readNumber(details, 'managedGeneration')
  }
  return Object.values(identity).every((value) => value !== null)
    ? (identity as ManagedServiceOwnerReference)
    : null
}

function readString(details: AppErrorDetails | undefined, key: string): string | null {
  const value = details?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNumber(details: AppErrorDetails | undefined, key: string): number | null {
  const value = details?.[key]
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}
