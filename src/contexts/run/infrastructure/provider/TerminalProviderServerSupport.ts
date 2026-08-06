import { timingSafeEqual } from 'node:crypto'
import type { Socket } from 'node:net'

import type { TerminalSessionSnapshot } from '../../application/dto/TerminalSessionSnapshot'
import type { StartTerminalProcessCommand } from '../../application/ports/TerminalProcessPort'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  encodeTerminalProviderFrame,
  type TerminalProviderEvent,
  type TerminalProviderRequest,
  type TerminalProviderResponse,
  terminalProviderProtocolVersion
} from './TerminalProviderProtocol'
import type { ProviderControllerState } from './TerminalProviderServerTypes'

export function authenticateTerminalProviderRequest(
  request: TerminalProviderRequest,
  expectedAuthToken: string
): void {
  if (
    request.protocolVersion < terminalProviderProtocolVersion - 1 ||
    request.protocolVersion > terminalProviderProtocolVersion
  ) {
    throw createExpectedAppError(
      'TERMINAL_PROVIDER_PROTOCOL_UNSUPPORTED',
      'Terminal provider protocol version is unsupported.'
    )
  }
  if (!matchesAuthToken(request.authToken, expectedAuthToken)) {
    throw createExpectedAppError(
      'TERMINAL_PROVIDER_AUTHENTICATION_FAILED',
      'Terminal provider authentication failed.'
    )
  }
}

export function authorizeTerminalProviderController(
  socket: Socket,
  request: TerminalProviderRequest,
  state: ProviderControllerState
): void {
  const method = request.method
  if (method === 'health' || method === 'claimController') return
  if (
    state.kind === 'active' &&
    state.socket === socket &&
    hasCurrentControllerLease(request, state.controllerLeaseId)
  ) {
    return
  }
  if (
    state.kind === 'releasing' &&
    state.socket === socket &&
    hasCurrentControllerLease(request, state.controllerLeaseId) &&
    (method === 'beginApplicationDetach' ||
      method === 'awaitApplicationDetach' ||
      method === 'detachApplication')
  ) {
    return
  }
  throw createExpectedAppError(
    'TERMINAL_PROVIDER_UNAVAILABLE',
    'Terminal provider request requires the active application controller.'
  )
}

export function createProviderSessionSnapshot(
  command: Omit<StartTerminalProcessCommand, 'onOutput' | 'onExit'>
): TerminalSessionSnapshot {
  return {
    ...command.scope,
    id: command.scope.sessionId,
    terminalBlockId: command.scope.blockId,
    workingDirectory: command.workingDirectory,
    processId: null,
    status: 'idle',
    kind: command.sessionKind ?? 'interactive',
    retentionPolicy: 'terminate-on-application-exit',
    recoveryKind: 'fresh',
    terminalSourceTheme: command.terminalSourceTheme ?? 'dark',
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}

export function splitUtf8(value: string, maxBytes: number): readonly string[] {
  if (Buffer.byteLength(value) <= maxBytes) return [value]
  const chunks: string[] = []
  let current = ''
  let currentBytes = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character)
    if (currentBytes + characterBytes > maxBytes && current) {
      chunks.push(current)
      current = ''
      currentBytes = 0
    }
    current += character
    currentBytes += characterBytes
  }
  if (current) chunks.push(current)
  return chunks
}

export function isTerminalProviderRequest(value: unknown): value is TerminalProviderRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'request' &&
    'protocolVersion' in value &&
    typeof value.protocolVersion === 'number' &&
    'requestId' in value &&
    typeof value.requestId === 'string' &&
    'authToken' in value &&
    typeof value.authToken === 'string' &&
    (!('controllerLeaseId' in value) || typeof value.controllerLeaseId === 'string') &&
    'method' in value &&
    typeof value.method === 'string' &&
    (!('deadlineMs' in value) ||
      (typeof value.deadlineMs === 'number' &&
        Number.isFinite(value.deadlineMs) &&
        value.deadlineMs > 0))
  )
}

function hasCurrentControllerLease(
  request: TerminalProviderRequest,
  controllerLeaseId: string
): boolean {
  return request.protocolVersion < terminalProviderProtocolVersion
    ? request.controllerLeaseId === undefined || request.controllerLeaseId === controllerLeaseId
    : request.controllerLeaseId === controllerLeaseId
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function matchesAuthToken(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

export function sendTerminalProviderMessage(
  socket: Socket,
  message: TerminalProviderResponse | TerminalProviderEvent
): void {
  if (!socket.destroyed) socket.write(encodeTerminalProviderFrame(message))
}
