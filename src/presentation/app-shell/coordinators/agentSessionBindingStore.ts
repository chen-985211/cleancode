import type {
  AgentRuntimeChangedEvent,
  AgentSessionSnapshot
} from '../../../contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { applyAgentRuntimeEvent } from '../../../contexts/agent/presentation/view-models/agentRuntimeReconciliation'
import {
  createTerminalSurfaceKey,
  type TerminalSurfaceRegistry
} from '../../../contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'

export interface AgentSessionBinding {
  readonly agentName: string
  readonly session: AgentSessionSnapshot
  readonly workspaceKey: string
}

/** Window-local projections live only while their console or retained Run view exists. */
export class AgentSessionBindingStore {
  private readonly bindings = new Map<string, AgentSessionBinding>()
  private readonly consumers = new Map<string, Set<symbol>>()

  constructor(private readonly surfaces: Pick<TerminalSurfaceRegistry, 'hasRetained' | 'forget'>) {}

  read(workspaceKey: string, agent: WorkspaceAgentSnapshot): AgentSessionBinding | null {
    const binding = this.bindings.get(workspaceKey)
    const session = binding?.session
    const identity = session?.runtime.terminal.viewIdentity
    return binding &&
      session &&
      identity &&
      session.agentId === agent.agentId &&
      session.projectId === agent.projectId &&
      session.workspaceId === agent.workspaceId &&
      session.providerId === agent.providerId &&
      this.surfaces.hasRetained(identity)
      ? binding
      : null
  }

  acquire(workspaceKey: string): () => void {
    const token = Symbol()
    const consumers = this.consumers.get(workspaceKey) ?? new Set<symbol>()
    consumers.add(token)
    this.consumers.set(workspaceKey, consumers)
    return () => {
      consumers.delete(token)
      if (!consumers.size) this.consumers.delete(workspaceKey)
      // The terminal's layout cleanup retains its mount later in this same commit.
      queueMicrotask(this.prune)
    }
  }

  remember(binding: AgentSessionBinding): void {
    const previous = this.bindings.get(binding.workspaceKey)?.session.runtime.terminal.viewIdentity
    const next = binding.session.runtime.terminal.viewIdentity
    if (
      previous &&
      (!next || createTerminalSurfaceKey(previous) !== createTerminalSurfaceKey(next))
    ) {
      this.surfaces.forget(previous)
    }
    this.bindings.set(binding.workspaceKey, binding)
  }

  accept(event: AgentRuntimeChangedEvent): void {
    for (const binding of [...this.bindings.values()]) {
      if (binding.session.agentId !== event.agentId) continue
      const session = applyAgentRuntimeEvent(binding.session, event)
      if (session !== binding.session) this.remember({ ...binding, session })
    }
    this.prune()
  }

  readonly prune = (): void => {
    for (const [key, binding] of this.bindings) {
      const identity = binding.session.runtime.terminal.viewIdentity
      if (!this.consumers.has(key) && (!identity || !this.surfaces.hasRetained(identity))) {
        this.bindings.delete(key)
      }
    }
  }
}
