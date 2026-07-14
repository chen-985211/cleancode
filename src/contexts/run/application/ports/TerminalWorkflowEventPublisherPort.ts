import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type { WorkflowRunSnapshot } from '../dto/WorkflowRunSnapshot'
import type { TerminalOutputEvent } from './TerminalProcessPort'

export type TerminalWorkflowEvent =
  | { readonly type: 'run-updated'; readonly run: WorkflowRunSnapshot }
  | {
      readonly type: 'terminal-session-started'
      readonly blockId: string
      readonly session: TerminalSessionSnapshot
      readonly clearOutput: boolean
    }
  | {
      readonly type: 'terminal-output'
      readonly blockId: string
      readonly output: TerminalOutputEvent
    }

export interface TerminalWorkflowEventPublisherPort {
  publish(event: TerminalWorkflowEvent): void
}
