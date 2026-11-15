import type { MessageKey } from '../../../../presentation/i18n/messages'
import type { WorkflowRunNodeStatus } from '../../application/dto/WorkflowRunSnapshot'
import type { TerminalViewState } from './TerminalPresentationTypes'

export type TerminalCollapsedFeedbackStatus = 'idle' | 'running' | 'done' | 'error'

export function terminalCollapsedFeedback(
  session: TerminalViewState,
  workflowStatus: WorkflowRunNodeStatus | undefined
): { readonly status: TerminalCollapsedFeedbackStatus; readonly labelKey: MessageKey } {
  if (session.isRecoveryPending) return { status: 'idle', labelKey: 'terminal.status.idle' }
  if (session.servicePortState === 'quarantined')
    return { status: 'error', labelKey: 'service.quarantined' }
  if (session.servicePortState === 'releasing')
    return { status: 'idle', labelKey: 'service.releasing' }
  if (workflowStatus) {
    const status =
      workflowStatus === 'running'
        ? 'running'
        : workflowStatus === 'ready' || workflowStatus === 'succeeded'
          ? 'done'
          : workflowStatus === 'failed'
            ? 'error'
            : 'idle'
    return { status, labelKey: `workflow.status.${workflowStatus}` }
  }
  if (session.status === 'failed' || session.autoStartStatus === 'failed' || session.portConflict)
    return { status: 'error', labelKey: 'terminal.status.failed' }
  if (
    session.status === 'running' &&
    session.servicePortState === 'bound' &&
    session.actualEndpoint
  )
    return { status: 'done', labelKey: 'workflow.status.ready' }
  // A live interactive/direct shell does not prove that its foreground command is running.
  return { status: 'idle', labelKey: `terminal.status.${session.status}` }
}
