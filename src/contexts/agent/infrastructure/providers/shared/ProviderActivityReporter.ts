import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { Socket } from 'node:net'

import type { AgentActivityStatus } from '../../../application/dto/AgentSessionProtocol'
import type { AgentTelemetryContribution } from '../../../application/ports/AgentProviderContribution'

/** Launch-private event ingress. Identity reports retain their separate persistence channel. */
export async function prepareProviderActivityReporter(
  command: Parameters<AgentTelemetryContribution['prepare']>[0],
  providerId: string
): Promise<Readonly<Record<string, string>>> {
  const disabled = { CLEANCODE_PROVIDER_ACTIVITY_PROVIDER: providerId }
  if (!command.onActivityChanged && !command.onTurnCompleted) return disabled
  const token = randomBytes(24).toString('hex')
  const sockets = new Set<Socket>()
  let revision = 0
  let disposed = false
  const server = createServer((request, response) => {
    if (
      disposed ||
      request.method !== 'POST' ||
      request.url !== '/activity' ||
      request.headers.authorization !== `Bearer ${token}`
    ) {
      response.writeHead(403).end()
      return
    }
    let body = ''
    request.setEncoding('utf8')
    request.on('error', () => undefined)
    request.on('data', (chunk: string) => {
      body += chunk
      if (body.length > 4096) request.destroy()
    })
    request.on('end', () => {
      try {
        const report = JSON.parse(body) as {
          revision?: unknown
          signal?: { type?: unknown; status?: unknown }
        }
        if (
          disposed ||
          !Number.isSafeInteger(report.revision) ||
          Number(report.revision) <= revision
        ) {
          response.writeHead(409).end()
          return
        }
        const signal = report.signal
        if (
          signal?.type !== 'turn_completed' &&
          !(signal?.type === 'status_changed' && isStatus(signal.status))
        ) {
          response.writeHead(400).end()
          return
        }
        revision = Number(report.revision)
        if (signal.type === 'turn_completed') command.onTurnCompleted?.()
        else command.onActivityChanged?.(signal.status as AgentActivityStatus)
        response.writeHead(204).end()
      } catch {
        // Malformed reports and failed projections must never affect the CLI.
        response.writeHead(400).end()
      }
    })
  })
  server.requestTimeout = 1000
  server.maxConnections = 8
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.setTimeout(1000, () => socket.destroy())
    socket.once('close', () => sockets.delete(socket))
  })
  const listening = await new Promise<boolean>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(true)
    })
  }).catch(() => false)
  if (!listening) {
    server.close(() => undefined)
    return disabled
  }
  let disposal: Promise<void> | undefined
  command.artifacts.track('provider-activity-reporter', {
    dispose() {
      return (disposal ??= new Promise<void>((resolve) => {
        disposed = true
        server.close(() => resolve())
        for (const socket of sockets) socket.destroy()
      }))
    }
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Provider activity address unavailable.')
  return {
    CLEANCODE_PROVIDER_ACTIVITY_PROVIDER: providerId,
    CLEANCODE_PROVIDER_ACTIVITY_TOKEN: token,
    CLEANCODE_PROVIDER_ACTIVITY_URL: `http://127.0.0.1:${address.port}/activity`
  }
}

function isStatus(value: unknown): value is AgentActivityStatus {
  return (
    value === 'idle' ||
    value === 'working' ||
    value === 'waiting_input' ||
    value === 'waiting_approval' ||
    value === 'unavailable'
  )
}
