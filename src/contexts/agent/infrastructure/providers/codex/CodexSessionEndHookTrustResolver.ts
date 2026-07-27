import { spawn } from 'node:child_process'

import { createAgentProviderCliProcessInvocation } from '../shared/NodeAgentProviderCliDetector'
import { serializeCodexTomlLiteralString } from './CodexTomlConfiguration'

export interface CodexSessionEndHookTrustInput {
  readonly executable: string
  readonly hookCommand: string
  readonly hookConfiguration: string
  readonly workspaceDirectory: string
}

export type CodexSessionEndHookTrustResolver = (
  input: CodexSessionEndHookTrustInput
) => Promise<string | null>

const initializeRequestId = 1
const hooksListRequestId = 2
const appServerTimeoutMs = process.platform === 'win32' ? 7_500 : 2_500

export async function resolveCodexSessionEndHookTrust(
  input: CodexSessionEndHookTrustInput
): Promise<string | null> {
  try {
    const response = await requestHooksList(input)
    return createCodexSessionEndHookTrustConfiguration(response, input.hookCommand)
  } catch {
    return null
  }
}

export function createCodexSessionEndHookTrustConfiguration(
  response: unknown,
  expectedCommand: string
): string | null {
  const matches = readHookEntries(response).filter(
    (hook) =>
      hook.command === expectedCommand &&
      hook.eventName === 'sessionEnd' &&
      hook.handlerType === 'command' &&
      hook.isManaged === false &&
      hook.source === 'sessionFlags' &&
      typeof hook.currentHash === 'string' &&
      hook.currentHash.length > 0 &&
      typeof hook.key === 'string' &&
      hook.key.length > 0
  )
  if (matches.length !== 1) return null
  const [hook] = matches
  const key = serializeCodexTomlLiteralString(hook!.key as string)
  const trustedHash = serializeCodexTomlLiteralString(hook!.currentHash as string)
  if (!key || !trustedHash) return null
  return `hooks.state={${key}={trusted_hash=${trustedHash}}}`
}

function requestHooksList(input: CodexSessionEndHookTrustInput): Promise<unknown> {
  const invocation = createAgentProviderCliProcessInvocation(input.executable, [
    '--config',
    input.hookConfiguration,
    'app-server'
  ])
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.executable, [...invocation.args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    let output = ''
    let errorOutput = ''
    let settled = false
    const timeout = setTimeout(
      () => finish(new Error('Timed out while reading Codex hooks/list.')),
      appServerTimeoutMs
    )

    const finish = (error?: Error, result?: unknown): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.stdin.end()
      if (!child.killed) child.kill()
      if (error) reject(error)
      else resolve(result)
    }

    child.once('error', (error) => finish(error))
    child.stdin.on('error', (error) => finish(error))
    child.once('exit', (code, signal) => {
      if (!settled) {
        finish(
          new Error(
            `Codex app-server exited before hooks/list (${String(code ?? signal)}): ${errorOutput}`
          )
        )
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      if (errorOutput.length < 16_000) errorOutput += chunk
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      output += chunk
      if (output.length > 1_000_000) {
        finish(new Error('Codex hooks/list response exceeded the supported size.'))
        return
      }
      output = consumeJsonLines(output, (message) => {
        if (message.id === initializeRequestId) {
          if (message.error !== undefined) {
            finish(new Error('Codex app-server rejected initialization.'))
            return
          }
          child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`)
          child.stdin.write(
            `${JSON.stringify({
              id: hooksListRequestId,
              method: 'hooks/list',
              params: { cwds: [input.workspaceDirectory] }
            })}\n`
          )
          return
        }
        if (message.id !== hooksListRequestId) return
        if (message.error !== undefined) {
          finish(new Error('Codex app-server does not support hooks/list.'))
          return
        }
        finish(undefined, message.result)
      })
    })

    child.stdin.write(
      `${JSON.stringify({
        id: initializeRequestId,
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'cleancode',
            title: 'CleanCode',
            version: '0.1.0'
          }
        }
      })}\n`
    )
  })
}

function consumeJsonLines(
  input: string,
  consume: (message: Readonly<Record<string, unknown>>) => void
): string {
  let remaining = input
  let newlineIndex = remaining.indexOf('\n')
  while (newlineIndex >= 0) {
    const line = remaining.slice(0, newlineIndex).trim()
    remaining = remaining.slice(newlineIndex + 1)
    if (line) {
      try {
        const message = JSON.parse(line) as unknown
        if (isRecord(message)) consume(message)
      } catch {
        // Ignore non-protocol output and continue waiting for the bounded response.
      }
    }
    newlineIndex = remaining.indexOf('\n')
  }
  return remaining
}

function readHookEntries(response: unknown): Readonly<Record<string, unknown>>[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return []
  return response.data.flatMap((entry) =>
    isRecord(entry) && Array.isArray(entry.hooks) ? entry.hooks.filter(isRecord) : []
  )
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}
