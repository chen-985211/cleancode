import {
  agentInboxWakeupPrompt,
  type AgentMessageWakeupPort
} from '../../../application/ports/AgentMessageDeliveryPort'
import type { AgentRuntimeArtifact } from '../../../application/ports/AgentProviderContribution'

/** The native plugin owns the SDK and listener; the application still owns all scheduling. */
export class OpenCodeNativeMessageDelivery implements AgentMessageWakeupPort, AgentRuntimeArtifact {
  private endpoint?: string
  private token?: string
  private sessionId?: string
  private readonly lifetime = new AbortController()

  constructor(private readonly ready: (wakeup: AgentMessageWakeupPort) => void) {}

  bindSession(sessionId: string): void {
    this.sessionId = sessionId
    this.publishReady()
  }

  bindEndpoint(endpoint: string, token: string): void {
    const url = new URL(endpoint)
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.pathname !== '/cleancode-inbox' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return
    if (this.lifetime.signal.aborted) return
    this.endpoint = endpoint
    this.token = token
    this.publishReady()
  }

  async notify({
    notificationId,
    signal
  }: Parameters<AgentMessageWakeupPort['notify']>[0]): Promise<void> {
    if (!this.endpoint || !this.sessionId || this.lifetime.signal.aborted)
      throw new Error('OpenCode native session unavailable.')
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        notificationId,
        sessionID: this.sessionId,
        reminder: agentInboxWakeupPrompt
      }),
      signal: AbortSignal.any([signal, this.lifetime.signal, AbortSignal.timeout(10_000)])
    })
    await response.body?.cancel()
    if (!response.ok) throw new Error('OpenCode did not accept the inbox notification.')
  }

  async dispose(): Promise<void> {
    this.lifetime.abort()
    if (!this.endpoint) return
    await fetch(this.endpoint, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(2_000)
    })
      .then((response) => response.body?.cancel())
      .catch(() => undefined)
    this.endpoint = undefined
  }

  private publishReady(): void {
    if (this.endpoint && this.sessionId && !this.lifetime.signal.aborted) this.ready(this)
  }
}
