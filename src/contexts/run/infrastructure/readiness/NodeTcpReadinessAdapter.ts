import { connect, type Socket } from 'node:net'

import type {
  TcpReadinessPort,
  WaitForTcpReadinessCommand
} from '../../application/ports/TcpReadinessPort'

export interface NodeTcpReadinessOptions {
  readonly retryIntervalMs?: number
  readonly connectionTimeoutMs?: number
}

export class NodeTcpReadinessAdapter implements TcpReadinessPort {
  private readonly retryIntervalMs: number
  private readonly connectionTimeoutMs: number

  constructor(options: NodeTcpReadinessOptions = {}) {
    this.retryIntervalMs = options.retryIntervalMs ?? 100
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 500
  }

  async waitUntilReady(command: WaitForTcpReadinessCommand): Promise<void> {
    return new Promise((resolve, reject) => {
      let socket: Socket | null = null
      let retryTimer: ReturnType<typeof setTimeout> | null = null

      const cleanup = (): void => {
        socket?.destroy()
        socket = null
        if (retryTimer) {
          clearTimeout(retryTimer)
          retryTimer = null
        }
        command.signal.removeEventListener('abort', handleAbort)
      }
      const handleAbort = (): void => {
        cleanup()
        reject(new Error('TCP readiness check was cancelled.'))
      }
      const retry = (): void => {
        socket?.destroy()
        socket = null

        if (!command.signal.aborted) {
          retryTimer = setTimeout(tryConnect, this.retryIntervalMs)
        }
      }
      const tryConnect = (): void => {
        socket = connect({ host: '127.0.0.1', port: command.port })
        socket.setTimeout(this.connectionTimeoutMs)
        socket.once('connect', () => {
          cleanup()
          resolve()
        })
        socket.once('error', retry)
        socket.once('timeout', retry)
      }

      command.signal.addEventListener('abort', handleAbort, { once: true })

      if (command.signal.aborted) {
        handleAbort()
      } else {
        tryConnect()
      }
    })
  }
}
