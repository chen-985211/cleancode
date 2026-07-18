import { createServer, type Server } from 'node:net'

import type {
  LocalPortReservation,
  LocalPortReservationPort
} from '../../application/ports/LocalPortReservationPort'

export class NodeLocalPortReservationAdapter implements LocalPortReservationPort {
  constructor(private readonly serverFactory: () => Server = createServer) {}

  async tryReserve(command: {
    readonly host: '127.0.0.1'
    readonly port?: number
  }): Promise<LocalPortReservation | null> {
    const server = this.serverFactory()

    try {
      await listen(server, command.host, command.port ?? 0)
    } catch (error) {
      server.close()
      if (isAddressInUseError(error)) {
        return null
      }
      throw error
    }

    const address = server.address()
    if (!address || typeof address === 'string') {
      await close(server)
      throw new Error('Local port reservation did not expose a TCP address.')
    }

    let released = false
    let releasePromise: Promise<void> | null = null
    return {
      host: command.host,
      port: address.port,
      release: () => {
        if (released) return Promise.resolve()
        if (releasePromise) return releasePromise

        const pendingRelease = close(server).then(() => {
          released = true
        })
        releasePromise = pendingRelease
        const clearPendingRelease = (): void => {
          if (releasePromise === pendingRelease) {
            releasePromise = null
          }
        }
        void pendingRelease.then(clearPendingRelease, clearPendingRelease)
        return pendingRelease
      }
    }
  }
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error): void => {
      server.off('listening', handleListening)
      reject(error)
    }
    const handleListening = (): void => {
      server.off('error', handleError)
      resolve()
    }
    server.once('error', handleError)
    server.once('listening', handleListening)
    server.listen({ host, port, exclusive: true })
  })
}

function close(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

function isAddressInUseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'EADDRINUSE'
  )
}
