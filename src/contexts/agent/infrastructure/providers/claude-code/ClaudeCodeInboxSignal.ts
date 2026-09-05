import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import {
  agentInboxWakeupPrompt,
  type AgentMessageWakeupPort
} from '../../../application/ports/AgentMessageDeliveryPort'
import type { AgentRuntimeArtifact } from '../../../application/ports/AgentProviderContribution'
import {
  createTemporaryProviderConfig,
  type TemporaryProviderConfig
} from '../shared/TemporaryProviderConfig'

/** A write is not delivery: the native FileChanged hook must claim the notification. */
export class ClaudeCodeInboxSignal implements AgentMessageWakeupPort, AgentRuntimeArtifact {
  // Claude's idle_prompt notification means the completed turn has been idle for a minute.
  readonly canNotifyWhileWaitingForInput = true
  private closed = false
  private pending?: { accept(): void; cancel(): void }

  private constructor(private readonly file: TemporaryProviderConfig) {}

  static async create(): Promise<ClaudeCodeInboxSignal> {
    return new ClaudeCodeInboxSignal(await createTemporaryProviderConfig('cc-inbox-', 'signal', ''))
  }

  get path(): string {
    return this.file.path
  }

  notify({ signal }: Parameters<AgentMessageWakeupPort['notify']>[0]): Promise<void> {
    if (this.closed || signal.aborted)
      return Promise.reject(new Error('Agent notification cancelled.'))
    if (this.pending) return Promise.reject(new Error('Agent notification already pending.'))
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error): void => {
        if (this.pending !== pending) return
        this.pending = undefined
        clearTimeout(timeout)
        signal.removeEventListener('abort', pending.cancel)
        if (error) reject(error)
        else resolve()
      }
      const pending = {
        accept: () => finish(),
        cancel: () => finish(new Error('Agent notification cancelled.'))
      }
      this.pending = pending
      const timeout = setTimeout(
        () => finish(new Error('Native Agent did not accept inbox notification.')),
        10_000
      )
      signal.addEventListener('abort', pending.cancel, { once: true })
      // Native watchers may debounce until the file is quiet. Only the application
      // retries a timed-out attempt; repeated writes here would starve that watcher.
      void writeFile(this.path, randomUUID(), { mode: 0o600 }).catch(() =>
        finish(new Error('Unable to signal Agent inbox.'))
      )
    })
  }

  claim(path: unknown): string | undefined {
    if (this.closed || path !== this.path || !this.pending) return undefined
    this.pending.accept()
    return agentInboxWakeupPrompt
  }

  async dispose(): Promise<void> {
    this.closed = true
    this.pending?.cancel()
    await this.file.dispose()
  }
}
