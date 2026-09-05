import {
  AgentMessageLog,
  type AgentMessage,
  type AgentMessageInput
} from '../../domain/entities/AgentMessageLog'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { AgentInboxDelivery } from './AgentInboxDelivery'
import type {
  AgentMessageDeliveryLease,
  AgentMessageDeliveryState,
  AgentMessageDeliveryStatus,
  AgentMessageIdentity
} from '../ports/AgentMessageDeliveryPort'

export interface AgentMessageCaller {
  readonly agentId: string
  readonly projectId: string
  readonly workspaceId: string
  readonly sessionId: string
}

export interface WaitAgentMessageInput {
  readonly acknowledgeMessageId?: string
  readonly replyToMessageId?: string
  readonly timeoutMs?: number
}

export type AgentMessageWaitResult =
  | { readonly status: 'message'; readonly message: AgentMessage }
  | { readonly status: 'timeout' | 'canceled' }

interface MessageWaiter {
  readonly sessionId: string
  readonly deliver: () => void
  readonly cancel: () => void
}

export class AgentMessageMailbox {
  private readonly logs = new Map<string, AgentMessageLog>()
  private readonly waiters = new Map<string, MessageWaiter>()
  private readonly deliveries = new Map<string, AgentInboxDelivery>()

  registerDelivery(
    identity: AgentMessageIdentity,
    state: () => AgentMessageDeliveryState
  ): AgentMessageDeliveryLease {
    const key = this.inboxKey(identity)
    this.deliveries.get(key)?.close()
    const delivery = new AgentInboxDelivery(
      state,
      () => this.log(identity).pendingIds(identity.agentId),
      () => this.waiters.has(key),
      () => {
        if (this.deliveries.get(key) === delivery) this.deliveries.delete(key)
      }
    )
    this.deliveries.set(key, delivery)
    return delivery
  }

  deliveryStatus(identity: AgentMessageIdentity): AgentMessageDeliveryStatus {
    if (this.waiters.has(this.inboxKey(identity))) return 'waiting'
    return this.deliveries.get(this.inboxKey(identity))?.status ?? 'offline'
  }

  send(caller: AgentMessageCaller, input: AgentMessageInput): AgentMessage {
    const message = this.log(caller).append(caller.agentId, input)
    this.waiters.get(this.inboxKey({ ...caller, agentId: input.toAgentId }))?.deliver()
    this.deliveries.get(this.inboxKey({ ...caller, agentId: input.toAgentId }))?.refresh()
    return message
  }

  wait(
    caller: AgentMessageCaller,
    input: WaitAgentMessageInput,
    signal?: AbortSignal
  ): Promise<AgentMessageWaitResult> {
    const key = this.inboxKey(caller)
    if (this.waiters.has(key)) {
      throw createExpectedAppError(
        'AGENT_TOOL_INPUT_INVALID',
        'This Agent already has a pending message wait.'
      )
    }
    if (signal?.aborted) return Promise.resolve({ status: 'canceled' })
    const timeoutMs = input.timeoutMs ?? 30_000
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 45_000) {
      throw createExpectedAppError(
        'AGENT_TOOL_INPUT_INVALID',
        'Message wait timeout must be between 0 and 45000 ms.'
      )
    }
    const log = this.log(caller)
    if (input.acknowledgeMessageId) log.acknowledge(caller.agentId, input.acknowledgeMessageId)
    const next = () => log.next(caller.agentId, input.replyToMessageId)
    const available = next()
    if (available) {
      this.deliveries.get(key)?.markReceived(available.messageId)
      return Promise.resolve({ message: available, status: 'message' })
    }
    if (timeoutMs === 0) return Promise.resolve({ status: 'timeout' })
    return new Promise((resolve) => {
      const finish = (result: AgentMessageWaitResult) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
        this.waiters.delete(key)
        if (result.status === 'message')
          this.deliveries.get(key)?.markReceived(result.message.messageId)
        else this.deliveries.get(key)?.refresh()
        resolve(result)
      }
      const cancel = () => finish({ status: 'canceled' })
      const timer = setTimeout(() => finish({ status: 'timeout' }), timeoutMs)
      this.waiters.set(key, {
        cancel,
        deliver: () => {
          const message = next()
          if (message) finish({ message, status: 'message' })
        },
        sessionId: caller.sessionId
      })
      signal?.addEventListener('abort', cancel, { once: true })
    })
  }

  closeSession(sessionId: string): void {
    for (const waiter of this.waiters.values()) {
      if (waiter.sessionId === sessionId) waiter.cancel()
    }
  }

  isWaiting(caller: AgentMessageCaller): boolean {
    return this.waiters.has(this.inboxKey(caller))
  }

  private log(caller: AgentMessageIdentity): AgentMessageLog {
    const key = JSON.stringify([caller.projectId, caller.workspaceId])
    let log = this.logs.get(key)
    if (!log) {
      log = new AgentMessageLog()
      this.logs.set(key, log)
    }
    return log
  }

  private inboxKey(caller: AgentMessageIdentity): string {
    return JSON.stringify([caller.projectId, caller.workspaceId, caller.agentId])
  }
}
