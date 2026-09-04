import { spawn } from 'node:child_process'

import { createAgentProviderCliProcessInvocation } from '../shared/NodeAgentProviderCliDetector'

interface CodexThreadResumabilityInput {
  readonly appServerArgs: readonly string[]
  readonly environment: Readonly<Record<string, string>>
  readonly executable: string
  readonly threadId: string
  readonly workspaceDirectory: string
}

type CodexThreadResumability = 'available' | 'missing' | 'unavailable'

export type CodexThreadResumabilityInspector = (
  input: CodexThreadResumabilityInput
) => Promise<CodexThreadResumability>

export const inspectCodexThreadResumability: CodexThreadResumabilityInspector = async (input) => {
  try {
    return await readPersistedThread(input)
  } catch {
    return 'unavailable'
  }
}

function readPersistedThread(
  input: CodexThreadResumabilityInput
): Promise<CodexThreadResumability> {
  const invocation = createAgentProviderCliProcessInvocation(input.executable, [
    ...input.appServerArgs,
    'app-server'
  ])
  return new Promise((resolve) => {
    // A separate app-server has no live threads: thread/read can only confirm persisted metadata.
    const child = spawn(invocation.executable, [...invocation.args], {
      cwd: input.workspaceDirectory,
      env: { ...process.env, ...input.environment },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    let output = ''
    let initialized = false
    let settled = false
    let forceKill: ReturnType<typeof setTimeout> | undefined
    const timeout = setTimeout(() => finish('unavailable'), 7_500)
    const finish = (status: CodexThreadResumability): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.stdin.end()
      if (child.exitCode === null && child.signalCode === null) {
        child.kill()
        forceKill = setTimeout(() => child.kill('SIGKILL'), 500)
        forceKill.unref()
      }
      resolve(status)
    }
    child.once('close', () => {
      clearTimeout(forceKill)
      finish('unavailable')
    })
    child.once('error', () => finish('unavailable'))
    child.stdin.on('error', () => finish('unavailable'))
    child.stderr.resume()
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (settled) return
      output += chunk
      if (output.length > 1_000_000) {
        finish('unavailable')
        return
      }
      let newline = output.indexOf('\n')
      while (!settled && newline >= 0) {
        const line = output.slice(0, newline)
        output = output.slice(newline + 1)
        const message = readMessage(line)
        if (message?.id === 1 && !initialized) {
          if (message.error !== undefined || !isRecord(message.result)) {
            finish('unavailable')
            return
          }
          initialized = true
          child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`)
          child.stdin.write(
            `${JSON.stringify({
              id: 2,
              method: 'thread/read',
              params: { threadId: input.threadId, includeTurns: false }
            })}\n`
          )
        } else if (message?.id === 2 && initialized) {
          finish(classifyThreadRead(message, input.threadId))
        }
        newline = output.indexOf('\n')
      }
    })
    child.stdin.write(
      `${JSON.stringify({
        id: 1,
        method: 'initialize',
        params: { clientInfo: { name: 'cleancode', title: 'CleanCode', version: '0.1.0' } }
      })}\n`
    )
  })
}

function classifyThreadRead(
  message: Record<string, unknown>,
  threadId: string
): CodexThreadResumability {
  if (message.error !== undefined) {
    const error = message.error
    // Only explicit absence of this exact ID permits dropping a saved binding.
    if (
      isRecord(error) &&
      error.code === -32600 &&
      [`thread not loaded: ${threadId}`, `no rollout found for thread id ${threadId}`].includes(
        String(error.message)
      )
    )
      return 'missing'
    return 'unavailable'
  }
  const result = message.result
  return isRecord(result) && isRecord(result.thread) && result.thread.id === threadId
    ? 'available'
    : 'unavailable'
}

function readMessage(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line)
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
