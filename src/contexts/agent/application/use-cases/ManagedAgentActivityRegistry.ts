import type {
  AgentActivityIdentity,
  AgentActivitySignal,
  AgentActivityTerminalScope
} from '../dto/AgentActivityProtocol'
import type { AgentActivityStatus, AgentTerminalViewIdentity } from '../dto/AgentSessionProtocol'
import type { AgentActivityRegistry } from '../services/AgentActivityRegistry'
import { transitionAgentRuntime, type ManagedAgentSession } from './AgentSessionRuntimeState'

export interface ManagedAgentActivityLaunch {
  isCurrent(): boolean
  recordExit(): boolean
  recordStatus(status: AgentActivityStatus): boolean
  recordTurnCompleted(): boolean
}

export class ManagedAgentActivityRegistry {
  private readonly terminalScopesByAgentSessionId = new Map<string, AgentActivityTerminalScope>()

  constructor(private readonly registry: AgentActivityRegistry) {}

  registerTerminal(
    session: ManagedAgentSession,
    viewIdentity: AgentTerminalViewIdentity | null | undefined
  ): AgentActivityTerminalScope | null {
    if (!viewIdentity) return null
    this.releaseTerminal(session.sessionId)
    const terminal: AgentActivityTerminalScope = {
      ...viewIdentity,
      gitBranch: session.gitBranch,
      projectDirectory: session.projectDirectory,
      workspaceDirectory: session.workspaceDirectory
    }
    if (!this.registry.registerTerminal(terminal)) return null
    this.terminalScopesByAgentSessionId.set(session.sessionId, terminal)
    return terminal
  }

  beginProviderLaunch(
    session: ManagedAgentSession,
    providerLaunchGeneration: number,
    activityTracking: boolean
  ): ManagedAgentActivityLaunch {
    const agentSessionId = session.sessionId
    const terminal = this.terminalScopesByAgentSessionId.get(agentSessionId)
    if (!terminal) return unavailableManagedAgentActivityLaunch
    const identity: AgentActivityIdentity = {
      invocationId: `managed:${agentSessionId}:${providerLaunchGeneration}`,
      managed: {
        agentId: session.agentId,
        ...(session.agentName ? { agentName: session.agentName } : {}),
        agentSessionId,
        providerLaunchGeneration
      },
      providerId: session.providerId,
      terminal
    }
    let exited = false
    let sourceRevision = 0
    const isCurrent = (): boolean =>
      session.sessionId === agentSessionId &&
      session.providerLaunchGeneration === providerLaunchGeneration &&
      session.isTerminalRunning &&
      (session.runtime.launch.status === 'launching' || session.runtime.launch.status === 'running')
    const record = (signal: AgentActivitySignal): boolean => {
      if (exited) return false
      sourceRevision += 1
      const accepted = this.registry.record({ identity, signal, sourceRevision })
      if (signal.type === 'invocation_exited') exited = true
      return accepted
    }
    return {
      isCurrent,
      recordExit: () => record({ type: 'invocation_exited' }),
      recordStatus: (status) => {
        if (!isCurrent()) return false
        transitionAgentRuntime(session, { activity: status })
        return record({ status, type: 'status_changed' })
      },
      recordTurnCompleted: () => {
        if (!isCurrent()) return false
        if (activityTracking) transitionAgentRuntime(session, { activity: 'idle' })
        return record({ type: 'turn_completed' })
      }
    }
  }

  updateAgentName(session: ManagedAgentSession): boolean {
    const terminal = this.terminalScopesByAgentSessionId.get(session.sessionId)
    if (!terminal || !session.agentName) return false
    return this.registry.updateManagedAgentName({
      agentName: session.agentName,
      agentSessionId: session.sessionId,
      terminal
    })
  }

  releaseTerminal(agentSessionId: string): boolean {
    const terminal = this.terminalScopesByAgentSessionId.get(agentSessionId)
    if (!terminal) return false
    this.terminalScopesByAgentSessionId.delete(agentSessionId)
    return this.registry.releaseTerminal(terminal)
  }

  releaseAll(): void {
    for (const sessionId of [...this.terminalScopesByAgentSessionId.keys()]) {
      this.releaseTerminal(sessionId)
    }
  }
}

const unavailableManagedAgentActivityLaunch: ManagedAgentActivityLaunch = {
  isCurrent: () => false,
  recordExit: () => false,
  recordStatus: () => false,
  recordTurnCompleted: () => false
}
