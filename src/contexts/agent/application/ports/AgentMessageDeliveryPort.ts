import type { AgentActivityStatus } from '../dto/AgentActivityStatus'

export interface AgentMessageIdentity {
  readonly agentId: string
  readonly projectId: string
  readonly workspaceId: string
}

export type AgentMessageDeliveryStatus =
  'waiting' | 'ready' | 'pending' | 'busy' | 'offline' | 'pull_only' | 'notified' | 'failed'

export interface AgentMessageDeliveryState {
  readonly running: boolean
  readonly mcpReady: boolean
  readonly activity: AgentActivityStatus
}

export interface AgentMessageWakeupPort {
  /** The native transport itself queues work without interrupting a running turn. */
  readonly canQueueWhileBusy?: boolean
  /** The Provider's waiting-input signal represents an idle prompt safe to notify. */
  readonly canNotifyWhileWaitingForInput?: boolean
  notify(command: { readonly notificationId: string; readonly signal: AbortSignal }): Promise<void>
}

export interface AgentMessageDeliveryLease {
  setWakeup(wakeup: AgentMessageWakeupPort | null): void
  refresh(): void
  completeTurn(): void
  close(): void
  settle(): Promise<void>
  dispose(): Promise<void>
}

/** Only this fixed reminder crosses a native wakeup channel; peer text stays in MCP results. */
export const agentInboxWakeupPrompt = 'CleanCode: check your collaboration inbox.'
