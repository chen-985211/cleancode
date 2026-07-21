import { timingSafeEqual } from 'node:crypto'

import type { TerminalSessionSnapshot } from '../../application/dto/TerminalSessionSnapshot'
import type { StartTerminalProcessCommand } from '../../application/ports/TerminalProcessPort'
import type { TerminalProviderRequest } from './TerminalProviderProtocol'

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
    'method' in value &&
    typeof value.method === 'string'
  )
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function matchesAuthToken(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}
