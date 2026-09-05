import type {
  AgentMessageDeliveryLease,
  AgentMessageDeliveryState,
  AgentMessageDeliveryStatus,
  AgentMessageWakeupPort
} from '../ports/AgentMessageDeliveryPort'

/** One launch's notification resource. The mailbox remains the message authority. */
export class AgentInboxDelivery implements AgentMessageDeliveryLease {
  private wakeup?: AgentMessageWakeupPort | null
  private readonly received = new Set<string>()
  private readonly notified = new Set<string>()
  private readonly cancellation = new AbortController()
  private pending?: Promise<void>
  private retry?: ReturnType<typeof setTimeout>
  private failures = 0
  private failed = false
  private attemptedIds = new Set<string>()

  constructor(
    private readonly state: () => AgentMessageDeliveryState,
    private readonly pendingIds: () => readonly string[],
    private readonly isWaiting: () => boolean,
    private readonly onClosed: () => void
  ) {}

  get status(): AgentMessageDeliveryStatus {
    if (this.cancellation.signal.aborted) return 'offline'
    if (this.isWaiting()) return 'waiting'
    if (this.wakeup === null) return 'pull_only'
    const state = this.state()
    if (!state.running || !state.mcpReady || !this.wakeup) return 'pending'
    if (!canNotify(this.wakeup, state.activity)) return 'busy'
    if (this.failed) return 'failed'
    return this.pendingIds().some((id) => this.notified.has(id) && !this.received.has(id))
      ? 'notified'
      : 'ready'
  }

  setWakeup(wakeup: AgentMessageWakeupPort | null): void {
    if (this.cancellation.signal.aborted) return
    this.wakeup = wakeup
    this.refresh()
  }

  markReceived(messageId: string): void {
    this.received.add(messageId)
    this.refresh()
  }

  refresh(): void {
    if (this.cancellation.signal.aborted || this.pending || this.isWaiting()) return
    const state = this.state()
    if (
      !state.running ||
      !state.mcpReady ||
      !this.wakeup ||
      !canNotify(this.wakeup, state.activity)
    )
      return
    const ids = this.pendingIds().filter((id) => !this.received.has(id) && !this.notified.has(id))
    if (this.failures >= 3 && ids.some((id) => !this.attemptedIds.has(id))) {
      this.failures = 0
      this.failed = false
    }
    if (!ids.length || this.retry || this.failures >= 3) return
    this.attemptedIds = new Set(ids)
    const wakeup = this.wakeup
    this.pending = Promise.resolve()
      .then(async () => {
        const current = this.state()
        if (this.cancellation.signal.aborted || !current.running || !current.mcpReady) return false
        if (!canNotify(wakeup, current.activity)) return false
        if (this.isWaiting() || ids.every((id) => this.received.has(id))) return false
        await wakeup.notify({ notificationId: ids[0]!, signal: this.cancellation.signal })
        return true
      })
      .then((accepted) => {
        if (!accepted || this.cancellation.signal.aborted) return
        for (const id of ids) this.notified.add(id)
        this.failed = false
        this.failures = 0
      })
      .catch(() => {
        if (this.cancellation.signal.aborted) return
        this.failed = true
        this.failures++
        if (this.failures < 3) {
          this.retry = setTimeout(() => {
            this.retry = undefined
            this.refresh()
          }, this.failures * 1_000)
          this.retry.unref?.()
        }
      })
      .finally(() => {
        this.pending = undefined
        if (!this.failed) this.refresh()
      })
  }

  close(): void {
    if (this.cancellation.signal.aborted) return
    this.cancellation.abort()
    clearTimeout(this.retry)
    this.retry = undefined
    this.onClosed()
  }

  async settle(): Promise<void> {
    while (this.pending) await this.pending
  }

  async dispose(): Promise<void> {
    this.close()
    await this.settle()
  }
}

function canNotify(
  wakeup: AgentMessageWakeupPort,
  activity: AgentMessageDeliveryState['activity']
): boolean {
  return (
    wakeup.canQueueWhileBusy === true ||
    activity === 'idle' ||
    (wakeup.canNotifyWhileWaitingForInput === true && activity === 'waiting_input')
  )
}
