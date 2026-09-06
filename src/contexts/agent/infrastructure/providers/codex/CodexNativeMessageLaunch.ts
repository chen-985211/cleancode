import { randomUUID } from 'node:crypto'
import { watch } from 'node:fs'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { agentInboxWakeupPrompt } from '../../../application/ports/AgentMessageDeliveryPort'
import type {
  AgentLaunchPlan,
  CreateAgentLaunchPlanCommand
} from '../../../application/ports/AgentProviderContribution'
import { createTemporaryProviderConfig } from '../shared/TemporaryProviderConfig'
import { codexNativeMessageRelay } from './CodexNativeMessageRelay'

/** Unrecognized options retain the ordinary TUI: never silently drop user configuration. */
export function projectCodexServerArguments(args: readonly string[]): string[] | null {
  const server: string[] = []
  const values = new Set([
    '-m',
    '--model',
    '-a',
    '--ask-for-approval',
    '-s',
    '--sandbox',
    '--add-dir'
  ])
  const flags = new Set([
    '--dangerously-bypass-approvals-and-sandbox',
    '--approve-for-me',
    '--search',
    '--no-alt-screen'
  ])
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (['-c', '--config', '--enable', '--disable'].includes(arg)) {
      if (args[index + 1] === undefined) return null
      server.push(arg, args[++index]!)
    } else if (values.has(arg)) {
      if (args[++index] === undefined) return null
    } else if (!flags.has(arg)) return null
  }
  return server
}

export async function prepareCodexNativeMessageLaunch(input: {
  readonly command: CreateAgentLaunchPlanCommand
  readonly nativePlan: AgentLaunchPlan
  readonly serverArgs: readonly string[] | null
  readonly runtimeExecutable: string
  readonly runtimePlatform: NodeJS.Platform
  readonly bindIdentity: (listener: (threadId: string) => void) => void
}): Promise<AgentLaunchPlan> {
  const { command, nativePlan } = input
  if (!command.messageDelivery) return nativePlan
  if (!input.serverArgs) {
    command.messageDelivery(null)
    return nativePlan
  }
  const config = await createTemporaryProviderConfig(
    'cc-cdx-',
    'config.json',
    JSON.stringify({
      cwd: command.workspaceDirectory,
      executable: nativePlan.executable,
      serverArgs: input.serverArgs,
      tuiArgs: command.initialPrompt ? nativePlan.args.slice(0, -2) : nativePlan.args,
      initialPrompt: command.initialPrompt,
      reminder: agentInboxWakeupPrompt
    })
  )
  const directory = dirname(config.path)
  // Darwin's Unix socket path limit is 104 bytes including the trailing NUL.
  if (Buffer.byteLength(join(directory, 's')) >= 104) {
    await config.dispose()
    command.messageDelivery(null)
    return nativePlan
  }
  const observer: { readiness?: ReturnType<typeof watch> } = {}
  let closed = false
  let threadId: string | undefined
  let supported = false
  let pending: Promise<void> | undefined
  const send = async (request: unknown): Promise<void> => {
    const temporary = join(directory, `request-${randomUUID()}`)
    await writeFile(temporary, JSON.stringify(request), { mode: 0o600 })
    await rename(temporary, join(directory, 'request'))
  }
  command.artifacts.track('codex-native-session', {
    async dispose() {
      closed = true
      observer.readiness?.close()
      await pending?.catch(() => undefined)
      if (
        (await exists(join(directory, 'started'))) &&
        !(await exists(join(directory, 'closed')))
      ) {
        await send({ kind: 'close' })
        await waitForFile(directory, 'closed', () => true, 3_000)
      }
      await config.dispose()
    }
  })
  const relay = await createTemporaryProviderConfig(
    'cc-cdx-relay-',
    'relay.mjs',
    codexNativeMessageRelay
  )
  command.artifacts.track('codex-native-relay', relay)
  const wakeup = {
    canQueueWhileBusy: true,
    notify({
      notificationId,
      signal
    }: {
      notificationId: string
      signal: AbortSignal
    }): Promise<void> {
      if (closed || signal.aborted || !threadId)
        return Promise.reject(new Error('Codex native session unavailable.'))
      const id = threadId + ':' + notificationId
      const operation = (async () => {
        const acknowledged = waitForFile(
          directory,
          'response',
          (body) => {
            const response = JSON.parse(body)
            if (response.id !== id) return false
            if (!response.ok) throw new Error('Codex did not accept the inbox notification.')
            return true
          },
          12_000,
          signal
        )
        // Attach rejection before any asynchronous write to avoid unhandled aborts.
        const outcome = acknowledged.then(
          () => undefined,
          (error: unknown) => error
        )
        try {
          await send({ kind: 'notify', id, threadId })
          const error = await outcome
          if (error) throw error
        } finally {
          if (signal.aborted) await send({ kind: 'cancel', id }).catch(() => undefined)
        }
      })()
      pending = operation
      return operation
    }
  }
  // Probe the executable resolved inside the actual PTY environment, including overrides.
  // A detector's version string cannot establish which CLI that shell will run.
  const observeReadiness = async (): Promise<void> => {
    try {
      const status = JSON.parse(await readFile(join(directory, 'capability'), 'utf8'))
      if (closed) return
      supported = status.supported === true
      if (!supported) command.messageDelivery?.(null)
      else if (threadId) command.messageDelivery?.(wakeup)
    } catch {
      // The relay publishes the capability file atomically after its bounded probe.
    }
  }
  observer.readiness = watch(directory, (_event, name) => {
    if (name === 'capability') void observeReadiness()
  })
  observer.readiness.on('error', () => {
    if (!closed) command.messageDelivery?.(null)
  })
  input.bindIdentity((id) => {
    if (closed) return
    threadId = id
    if (supported) command.messageDelivery?.(wakeup)
  })
  return {
    ...nativePlan,
    executable: input.runtimeExecutable,
    args: [relay.path, config.path]
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function waitForFile(
  directory: string,
  filename: string,
  accept: (body: string) => boolean,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown): void => {
      watcher.close()
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve()
    }
    const abort = (): void => finish(new Error('Agent notification cancelled.'))
    const observe = async (): Promise<void> => {
      try {
        if (accept(await readFile(join(directory, filename), 'utf8'))) finish()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') finish(error)
      }
    }
    const watcher = watch(directory, (_event, name) => {
      if (name === filename) void observe()
    })
    watcher.on('error', finish)
    const timeout = setTimeout(
      () => finish(new Error('Native Agent notification timed out.')),
      timeoutMs
    )
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    else void observe()
  })
}
