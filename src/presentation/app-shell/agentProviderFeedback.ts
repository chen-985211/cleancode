import type {
  AgentMcpRuntimeStatus,
  AgentRuntimeSnapshot
} from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { AgentAttachOperation } from './useAgentSessionAttachment'
import type { AgentProviderPanelState } from './useAgentProviderState'

export type AgentMcpPresentationStatus = 'connecting' | 'degraded' | 'ready'

export type AgentFeedbackIssue =
  | 'attachment_failed'
  | 'binding_save_failed'
  | 'restore_failed'
  | 'session_ended'
  | 'session_interrupted'
  | 'start_failed'
  | 'terminal_failed'

export type AgentBlockingFeedback =
  | 'attachment_failed'
  | 'checking_provider'
  | 'provider_missing'
  | 'provider_unavailable'
  | 'provider_upgrade_required'
  | 'runtime_unavailable'

/**
 * Only facts the user cannot observe anywhere else may interrupt with a notification.
 * Everything else stays on the header status entry, which owns the persistent projection.
 */
export type AgentFeedbackEvent = 'binding_save_failed' | 'mcp_unavailable'

export interface AgentProviderFeedback {
  readonly blocking: AgentBlockingFeedback | null
  readonly events: readonly AgentFeedbackEvent[]
  readonly issues: readonly AgentFeedbackIssue[]
  readonly mcpStatus: AgentMcpPresentationStatus | null
}

export function deriveAgentProviderFeedback(input: {
  readonly attachment: AgentAttachOperation
  readonly runtime: AgentRuntimeSnapshot | null
  readonly state: AgentProviderPanelState
}): AgentProviderFeedback {
  const mcpStatus = projectMcpStatus(input.runtime?.mcp.status)
  if (input.runtime?.terminal.status === 'suspended') {
    return { blocking: null, events: [], issues: [], mcpStatus }
  }

  const issues: AgentFeedbackIssue[] = []
  const events: AgentFeedbackEvent[] = []
  let blocking: AgentBlockingFeedback | null = null

  if (input.attachment.status === 'failed') {
    if (input.runtime) {
      issues.push('attachment_failed')
    } else {
      blocking = 'attachment_failed'
    }
  }

  if (input.runtime) {
    const runtimeIssue = projectRuntimeIssue(input.runtime)
    if (runtimeIssue) {
      issues.push(runtimeIssue)
    }
    if (input.runtime.binding.status === 'persistence_failed') {
      issues.push('binding_save_failed')
      events.push('binding_save_failed')
    }
    if (input.runtime.mcp.status === 'failed') {
      events.push('mcp_unavailable')
    }
  } else if (
    blocking === null &&
    input.attachment.status !== 'measuring' &&
    input.attachment.status !== 'pending'
  ) {
    blocking = projectUnavailableRuntime(input.state)
  }

  return { blocking, events, issues, mcpStatus }
}

function projectMcpStatus(
  status: AgentMcpRuntimeStatus | undefined
): AgentMcpPresentationStatus | null {
  switch (status) {
    case 'inactive':
    case 'initializing':
      return 'connecting'
    case 'ready':
      return 'ready'
    case 'failed':
      return 'degraded'
    default:
      return null
  }
}

function projectRuntimeIssue(runtime: AgentRuntimeSnapshot): AgentFeedbackIssue | null {
  if (runtime.launch.status === 'failed' && runtime.launch.failureKind === 'restore') {
    return 'restore_failed'
  }
  if (
    runtime.terminal.status === 'running' &&
    (runtime.launch.status === 'exited' || runtime.launch.status === 'stopped')
  ) {
    return 'session_ended'
  }
  if (runtime.terminal.status === 'exited') {
    return 'session_interrupted'
  }
  if (runtime.terminal.status === 'failed') {
    return 'terminal_failed'
  }
  if (runtime.launch.status === 'failed') {
    return 'start_failed'
  }
  return null
}

function projectUnavailableRuntime(state: AgentProviderPanelState): AgentBlockingFeedback | null {
  if (state.status === 'unavailable') return 'runtime_unavailable'
  if (state.status === 'checking') return state.visible ? 'checking_provider' : null

  switch (state.availability.status) {
    case 'missing':
      return 'provider_missing'
    case 'temporarily_unavailable':
      return 'provider_unavailable'
    case 'upgrade_required':
      return 'provider_upgrade_required'
    case 'installed':
      return null
  }
}
