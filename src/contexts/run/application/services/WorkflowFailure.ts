import { getAppErrorCode } from '../../../../shared-kernel/application/errors/AppError'
import type { WorkflowRunFailureSnapshot } from '../dto/WorkflowRunSnapshot'

export function toWorkflowFailure(error: unknown): WorkflowRunFailureSnapshot {
  return {
    code: getAppErrorCode(error) ?? 'UNEXPECTED_ERROR',
    message: error instanceof Error ? error.message : String(error),
    ...(typeof error === 'object' && error !== null && 'details' in error
      ? {
          details: (
            error as {
              readonly details?: Readonly<Record<string, string | number | boolean | null>>
            }
          ).details
        }
      : {})
  }
}

export function isServicePortConflictFailure(failure: WorkflowRunFailureSnapshot): boolean {
  return (
    failure.code === 'SERVICE_PORT_FIXED_CONFLICT' ||
    failure.code === 'SERVICE_PORT_ALLOCATION_EXHAUSTED' ||
    failure.code === 'SERVICE_LISTENER_OWNERSHIP_MISMATCH' ||
    failure.code === 'SERVICE_LISTENER_OWNERSHIP_UNVERIFIED'
  )
}
