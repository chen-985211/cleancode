export const terminalProviderProtocolVersion = 1
export const terminalProviderMaxFrameBytes = 32 * 1024 * 1024
export const terminalProviderMaxOutputChunkBytes = 256 * 1024

export interface TerminalProviderRequest {
  readonly type: 'request'
  readonly protocolVersion: number
  readonly requestId: string
  readonly authToken: string
  readonly method: string
  readonly params?: unknown
}

export interface TerminalProviderResponse {
  readonly type: 'response'
  readonly requestId: string
  readonly ok: boolean
  readonly result?: unknown
  readonly error?: unknown
}

export interface TerminalProviderEvent {
  readonly type: 'event'
  readonly event: 'terminal-output' | 'terminal-exit' | 'recovery-issue'
  readonly payload: unknown
}

export type TerminalProviderMessage = TerminalProviderResponse | TerminalProviderEvent

export function encodeTerminalProviderFrame(message: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(message), 'utf8')
  if (payload.length > terminalProviderMaxFrameBytes) {
    throw new Error('Terminal provider frame exceeds the limit.')
  }
  const frame = Buffer.allocUnsafe(4 + payload.length)
  frame.writeUInt32BE(payload.length, 0)
  payload.copy(frame, 4)
  return frame
}

export class TerminalProviderFrameDecoder {
  private buffered: Buffer = Buffer.alloc(0)
  private expectedPayloadBytes: number | null = null

  push(chunk: Buffer): readonly unknown[] {
    this.buffered = this.buffered.length === 0 ? chunk : Buffer.concat([this.buffered, chunk])
    const messages: unknown[] = []

    while (true) {
      if (this.expectedPayloadBytes === null) {
        if (this.buffered.length < 4) break
        this.expectedPayloadBytes = this.buffered.readUInt32BE(0)
        this.buffered = this.buffered.subarray(4)
        if (this.expectedPayloadBytes > terminalProviderMaxFrameBytes) {
          this.reset()
          throw new Error('Terminal provider frame exceeds the limit.')
        }
      }
      if (this.buffered.length < this.expectedPayloadBytes) break

      const payload = this.buffered.subarray(0, this.expectedPayloadBytes)
      this.buffered = this.buffered.subarray(this.expectedPayloadBytes)
      this.expectedPayloadBytes = null
      try {
        messages.push(JSON.parse(payload.toString('utf8')) as unknown)
      } catch {
        this.reset()
        throw new Error('Terminal provider frame contains invalid JSON.')
      }
    }

    return messages
  }

  private reset(): void {
    this.buffered = Buffer.alloc(0)
    this.expectedPayloadBytes = null
  }
}
