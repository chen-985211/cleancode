import type { TerminalProviderRequest } from './TerminalProviderProtocol'

const maxPendingRequestsPerLane = 1_024

interface RequestLane {
  pendingCount: number
  tail: Promise<void>
}

export class TerminalProviderRequestScheduler {
  private readonly lanes = new Map<string, RequestLane>()

  schedule(request: TerminalProviderRequest, operation: () => Promise<void>): Promise<void> {
    const key = resolveRequestLane(request)
    const current = this.lanes.get(key) ?? { pendingCount: 0, tail: Promise.resolve() }
    if (current.pendingCount >= maxPendingRequestsPerLane) {
      return Promise.reject(new Error(`Terminal provider request lane is full: ${key}`))
    }

    current.pendingCount += 1
    const scheduled = current.tail.catch(() => undefined).then(operation)
    current.tail = scheduled
      .catch(() => undefined)
      .finally(() => {
        current.pendingCount -= 1
        if (current.pendingCount === 0 && this.lanes.get(key) === current) {
          this.lanes.delete(key)
        }
      })
    this.lanes.set(key, current)
    return scheduled
  }
}

function resolveRequestLane(request: TerminalProviderRequest): string {
  if (isControlMethod(request.method)) return 'control'
  if (request.method === 'setScrollbackRows') return 'settings'
  const sessionId = readSessionId(request.params)
  return sessionId ? `session:${sessionId}` : `global:${request.method}`
}

function isControlMethod(method: string): boolean {
  return (
    method === 'health' ||
    method === 'claimController' ||
    method === 'listSessions' ||
    method === 'beginApplicationDetach' ||
    method === 'awaitApplicationDetach' ||
    method === 'detachApplication'
  )
}

function readSessionId(params: unknown): string | null {
  if (!isRecord(params)) return null
  if (typeof params.sessionId === 'string') return params.sessionId
  if (isRecord(params.identity) && typeof params.identity.sessionId === 'string') {
    return params.identity.sessionId
  }
  if (isRecord(params.command)) {
    if (
      isRecord(params.command.identity) &&
      typeof params.command.identity.sessionId === 'string'
    ) {
      return params.command.identity.sessionId
    }
    if (isRecord(params.command.scope) && typeof params.command.scope.sessionId === 'string') {
      return params.command.scope.sessionId
    }
  }
  if (isRecord(params.foregroundJob) && typeof params.foregroundJob.sessionId === 'string') {
    return params.foregroundJob.sessionId
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
