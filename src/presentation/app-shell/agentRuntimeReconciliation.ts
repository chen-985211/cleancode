import type {
  AgentRuntimeChangedEvent,
  AgentSessionSnapshot
} from '../../contexts/agent/application/dto/AgentSessionProtocol'

export const maxPendingAgentRuntimeEvents = 16

export function applyAgentRuntimeEvent(
  session: AgentSessionSnapshot,
  event: AgentRuntimeChangedEvent
): AgentSessionSnapshot {
  if (session.sessionId !== event.sessionId || !isNewerRuntime(event.runtime, session.runtime)) {
    return session
  }
  return { ...session, runtime: event.runtime }
}

export function rememberLatestAgentRuntimeEvent(
  events: Map<string, AgentRuntimeChangedEvent>,
  event: AgentRuntimeChangedEvent
): void {
  const current = events.get(event.sessionId)
  if (!current || isNewerRuntime(event.runtime, current.runtime)) {
    events.delete(event.sessionId)
    events.set(event.sessionId, event)
    if (events.size > maxPendingAgentRuntimeEvents) {
      const oldestSessionId = events.keys().next().value
      if (oldestSessionId) events.delete(oldestSessionId)
    }
  }
}

function isNewerRuntime(
  candidate: AgentSessionSnapshot['runtime'],
  current: AgentSessionSnapshot['runtime']
): boolean {
  if (candidate.revision <= current.revision) return false
  if (!haveSameTerminalIdentity(candidate.terminal.viewIdentity, current.terminal.viewIdentity)) {
    return true
  }
  if (candidate.launch.generation < current.launch.generation) return false
  if (candidate.launch.generation !== current.launch.generation) return true
  if (current.launch.launchId && !candidate.launch.launchId) return false
  return !(
    current.launch.launchId &&
    candidate.launch.launchId &&
    current.launch.launchId !== candidate.launch.launchId
  )
}

function haveSameTerminalIdentity(
  first: AgentSessionSnapshot['runtime']['terminal']['viewIdentity'],
  second: AgentSessionSnapshot['runtime']['terminal']['viewIdentity']
): boolean {
  if (first === null || second === null) return first === second
  return (
    first.blockId === second.blockId &&
    first.generation === second.generation &&
    first.owner.id === second.owner.id &&
    first.owner.kind === second.owner.kind &&
    first.projectId === second.projectId &&
    first.runId === second.runId &&
    first.sessionId === second.sessionId &&
    first.workspaceName === second.workspaceName
  )
}
