import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import type {
  AgentPeerCanvasRequest,
  AgentPeerCanvasResponse
} from '../../contexts/agent/application/dto/AgentCollaborationProtocol'

export interface AgentCanvasSender {
  isDestroyed(): boolean
  send(channel: string, event: unknown): void
}

export class AgentPeerCanvasBridge {
  private readonly pending = new Map<
    string,
    { readonly sender: AgentCanvasSender; readonly finish: (created: boolean) => void }
  >()

  create(
    sender: AgentCanvasSender,
    scope: Omit<AgentPeerCanvasRequest, 'requestId'>
  ): Promise<void> {
    if (sender.isDestroyed()) return Promise.reject(unavailable())
    return new Promise((resolve, reject) => {
      const requestId = globalThis.crypto.randomUUID()
      const finish = (created: boolean) => {
        clearTimeout(timer)
        this.pending.delete(requestId)
        if (created) resolve()
        else reject(unavailable())
      }
      const timer = setTimeout(() => finish(false), 30_000)
      this.pending.set(requestId, { sender, finish })
      try {
        sender.send('cleancode:agent-peer-creation-requested', { ...scope, requestId })
      } catch {
        finish(false)
      }
    })
  }

  complete(sender: AgentCanvasSender, response: AgentPeerCanvasResponse): boolean {
    const pending = this.pending.get(response.requestId)
    if (!pending || pending.sender !== sender) return false
    pending.finish(response.created)
    return true
  }

  dispose(): void {
    for (const pending of this.pending.values()) pending.finish(false)
  }
}

function unavailable() {
  return createExpectedAppError(
    'AGENT_TOOL_UNAVAILABLE',
    'The canvas did not complete peer creation. Retry with the same agentId when its workspace is open.'
  )
}
