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
    return this.waitForState(command, true)
  }

  async waitUntilClosed(command: WaitForTcpReadinessCommand): Promise<void> {
    return this.waitForState(command, false)
  }

  private async waitForState(
    command: WaitForTcpReadinessCommand,
    expectedReachable: boolean
  ): Promise<void> {
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
        reject(command.signal.reason ?? new Error('TCP readiness check was cancelled.'))
      }
      const retry = (): void => {
        socket?.destroy()
        socket = null

        if (!command.signal.aborted) {
          retryTimer = setTimeout(tryConnect, this.retryIntervalMs)
        }
      }
      const tryConnect = (): void => {
        socket = connect({ host: command.host, port: command.port })
        socket.setTimeout(this.connectionTimeoutMs)
        socket.once('connect', () => {
          if (expectedReachable) {
            cleanup()
            resolve()
          } else {
            retry()
          }
        })
        socket.once('error', () => {
          if (expectedReachable) retry()
          else {
            cleanup()
            resolve()
          }
        })
        socket.once('timeout', () => {
          if (expectedReachable) retry()
          else {
            cleanup()
            resolve()
          }
        })
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
