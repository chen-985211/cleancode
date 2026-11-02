import type {
  AgentActivityStatus,
  AgentRuntimeChangedEvent,
  AgentBindingRuntimeStatus,
  AgentMcpRuntimeStatus,
  AgentRuntimeSnapshot
} from '../dto/AgentSessionProtocol'
import { haveSameLaunchRuntime, haveSameTerminalRuntime } from './AgentRuntimeFacetEquality'

interface AgentRuntimeTransitionTarget {
  readonly agentId: string
  readonly sessionId: string
  readonly callbacks: { readonly onRuntimeChanged?: (event: AgentRuntimeChangedEvent) => void }
  readonly messageDelivery?: { refresh(): void }
  runtime: AgentRuntimeSnapshot
}

export function createInitialAgentRuntime(
  input: {
    readonly executionDirectory?: string | null
    readonly binding?: AgentBindingRuntimeStatus
    readonly mcp?: AgentMcpRuntimeStatus
  } = {}
): AgentRuntimeSnapshot {
  return {
    ...(input.executionDirectory ? { executionDirectory: input.executionDirectory } : {}),
    activity: { status: 'unavailable' },
    binding: { status: input.binding ?? 'unbound' },
    launch: {
      exitCode: null,
      failureKind: null,
      generation: 0,
      launchId: null,
      status: 'not_started'
    },
    mcp: { status: input.mcp ?? 'disabled' },
    revision: 0,
    terminal: {
      exitCode: null,
      processId: null,
      status: 'not_started',
      stopReason: null,
      viewIdentity: null
    }
  }
}

export function transitionAgentRuntime(
  session: AgentRuntimeTransitionTarget,
  transition: {
    readonly activity?: AgentActivityStatus
    readonly executionDirectory?: string | null
    readonly binding?: AgentBindingRuntimeStatus
    readonly launch?: Partial<AgentRuntimeSnapshot['launch']>
    readonly mcp?: AgentMcpRuntimeStatus
    readonly terminal?: Partial<AgentRuntimeSnapshot['terminal']>
  }
): boolean {
  const runtime = session.runtime
  const nextDirectory =
    transition.executionDirectory === undefined
      ? runtime.executionDirectory
      : (transition.executionDirectory ?? undefined)
  const nextActivity = transition.activity ?? runtime.activity.status
  const nextBinding = transition.binding ?? runtime.binding.status
  const nextLaunch = { ...runtime.launch, ...transition.launch }
  const nextMcp = transition.mcp ?? runtime.mcp.status
  const nextTerminal = { ...runtime.terminal, ...transition.terminal }
  if (
    nextDirectory === runtime.executionDirectory &&
    nextActivity === runtime.activity.status &&
    nextBinding === runtime.binding.status &&
    haveSameLaunchRuntime(nextLaunch, runtime.launch) &&
    nextMcp === runtime.mcp.status &&
    haveSameTerminalRuntime(nextTerminal, runtime.terminal)
  ) {
    return false
  }

  session.runtime = {
    ...(nextDirectory ? { executionDirectory: nextDirectory } : {}),
    activity: { status: nextActivity },
    binding: { status: nextBinding },
    launch: nextLaunch,
    mcp: { status: nextMcp },
    revision: runtime.revision + 1,
    terminal: nextTerminal
  }
  session.messageDelivery?.refresh()
  try {
    session.callbacks.onRuntimeChanged?.({
      agentId: session.agentId,
      runtime: session.runtime,
      sessionId: session.sessionId
    })
  } catch {
    // Runtime observers must not participate in terminal or Provider lifecycle control flow.
  }
  return true
}
