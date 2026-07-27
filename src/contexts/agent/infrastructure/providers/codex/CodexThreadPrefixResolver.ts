import { spawn } from 'node:child_process'

import { createAgentProviderCliProcessInvocation } from '../shared/NodeAgentProviderCliDetector'

export interface CodexThreadPrefixResolverInput {
  readonly appServerArgs?: readonly string[]
  readonly environment?: Readonly<Record<string, string>>
  readonly executable: string
  readonly prefix: string
  readonly workspaceDirectory: string
}

export type CodexThreadPrefixResolver = (
  input: CodexThreadPrefixResolverInput
) => Promise<string | null>

interface ThreadListPage {
  readonly data: readonly { readonly id: string }[]
  readonly nextCursor: string | null
}

const initializeRequestId = 1
const threadListPageSize = 100
const appServerTimeoutMs = process.platform === 'win32' ? 12_000 : 7_500

export async function resolveCodexThreadIdPrefix(
  input: CodexThreadPrefixResolverInput
): Promise<string | null> {
  if (!isCodexThreadPrefix(input.prefix)) return null
  try {
    return await requestThreadLists(input)
  } catch {
    return null
  }
}

export function findUniqueCodexThreadIdByPrefix(
  responses: readonly unknown[],
  prefix: string
): string | null {
  if (!isCodexThreadPrefix(prefix)) return null
  const matches = new Set<string>()
  for (const response of responses) {
    const page = readThreadListPage(response)
    if (!page) continue
    for (const thread of page.data) {
      if (thread.id.startsWith(prefix)) matches.add(thread.id)
    }
  }
  return matches.size === 1 ? [...matches][0]! : null
}

function requestThreadLists(input: CodexThreadPrefixResolverInput): Promise<string | null> {
  const invocation = createAgentProviderCliProcessInvocation(input.executable, [
    ...(input.appServerArgs ?? []),
    'app-server'
  ])
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.executable, [...invocation.args], {
      cwd: input.workspaceDirectory,
      env: { ...process.env, ...input.environment },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    const phases = createThreadListPhases()
    const pages: unknown[] = []
    let currentPhase = 0
    let currentRequestId = initializeRequestId
    let errorOutput = ''
    let output = ''
    let settled = false
    const timeout = setTimeout(
      () => finish(new Error('Timed out while resolving a Codex thread title.')),
      appServerTimeoutMs
    )

    const finish = (error?: Error, result?: string | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.stdin.end()
      if (!child.killed) child.kill()
      if (error) reject(error)
      else resolve(result ?? null)
    }

    const requestPhasePage = (cursor: string | null): void => {
      const phase = phases[currentPhase]
      if (!phase) {
        finish(undefined, findUniqueCodexThreadIdByPrefix(pages, input.prefix))
        return
      }
      currentRequestId += 1
      child.stdin.write(
        `${JSON.stringify({
          id: currentRequestId,
          method: 'thread/list',
          params: {
            archived: phase.archived,
            cursor,
            limit: threadListPageSize,
            useStateDbOnly: phase.useStateDbOnly
          }
        })}\n`
      )
    }

    const completePhase = (): void => {
      const stateDbPhasesCompleted = currentPhase === 1
      if (stateDbPhasesCompleted) {
        const resolved = findUniqueCodexThreadIdByPrefix(pages, input.prefix)
        if (resolved) {
          finish(undefined, resolved)
          return
        }
        if (hasMultiplePrefixMatches(pages, input.prefix)) {
          finish(undefined, null)
          return
        }
      }
      currentPhase += 1
      requestPhasePage(null)
    }

    child.once('error', (error) => finish(error))
    child.stdin.on('error', (error) => finish(error))
    child.once('exit', (code, signal) => {
      if (!settled) {
        finish(
          new Error(
            `Codex app-server exited before thread/list (${String(code ?? signal)}): ${errorOutput}`
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
        finish(new Error('Codex thread/list response exceeded the supported size.'))
        return
      }
      output = consumeJsonLines(output, (message) => {
        if (message.id === initializeRequestId) {
          if (message.error !== undefined) {
            finish(new Error('Codex app-server rejected initialization.'))
            return
          }
          child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`)
          requestPhasePage(null)
          return
        }
        if (message.id !== currentRequestId) return
        if (message.error !== undefined) {
          finish(new Error('Codex app-server does not support thread/list.'))
          return
        }
        const page = readThreadListPage(message.result)
        if (!page) {
          finish(new Error('Codex app-server returned an invalid thread/list page.'))
          return
        }
        pages.push(page)
        if (page.nextCursor) requestPhasePage(page.nextCursor)
        else completePhase()
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

function createThreadListPhases() {
  return [
    { archived: false, useStateDbOnly: true },
    { archived: true, useStateDbOnly: true },
    { archived: false, useStateDbOnly: false },
    { archived: true, useStateDbOnly: false }
  ] as const
}

function hasMultiplePrefixMatches(responses: readonly unknown[], prefix: string): boolean {
  const matches = new Set<string>()
  for (const response of responses) {
    const page = readThreadListPage(response)
    if (!page) continue
    for (const thread of page.data) {
      if (thread.id.startsWith(prefix)) matches.add(thread.id)
      if (matches.size > 1) return true
    }
  }
  return false
}

function readThreadListPage(value: unknown): ThreadListPage | null {
  if (!isRecord(value) || !Array.isArray(value.data)) return null
  const data = value.data.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string') return []
    return isCodexThreadUuid(candidate.id) ? [{ id: candidate.id }] : []
  })
  const nextCursor =
    typeof value.nextCursor === 'string' && value.nextCursor.length > 0 ? value.nextCursor : null
  return { data, nextCursor }
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

function isCodexThreadPrefix(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{5}$/i.test(value)
}

function isCodexThreadUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}
