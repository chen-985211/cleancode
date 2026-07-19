import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type { WorkflowRunSnapshot } from '../dto/WorkflowRunSnapshot'
import type { TerminalOutputEvent } from './TerminalProcessPort'
import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import type { WorkflowRunFailureSnapshot } from '../dto/WorkflowRunSnapshot'

export type TerminalWorkflowEvent =
  | { readonly type: 'run-updated'; readonly run: WorkflowRunSnapshot }
  | {
      readonly type: 'terminal-session-started'
      readonly blockId: string
      readonly session: TerminalSessionSnapshot
      readonly clearOutput: boolean
      readonly endpoint: ActualServiceEndpoint | null
    }
  | {
      readonly type: 'terminal-output'
      readonly blockId: string
      readonly output: TerminalOutputEvent
    }
  | {
      readonly type: 'service-endpoint-updated'
      readonly scope: TerminalRunScope
      readonly endpoint: ActualServiceEndpoint | null
    }
  | {
      readonly type: 'service-port-state-changed'
      readonly scope: TerminalRunScope
      readonly state: 'releasing' | 'released' | 'quarantined'
    }
  | {
      readonly type: 'service-port-conflict'
      readonly failure: WorkflowRunFailureSnapshot
    }

export interface TerminalWorkflowEventPublisherPort {
  publish(event: TerminalWorkflowEvent): void
}
