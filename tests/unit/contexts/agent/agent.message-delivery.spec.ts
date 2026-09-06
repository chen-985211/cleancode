import type {
  AgentMessageDeliveryState,
  AgentMessageWakeupPort
} from '../../../../src/contexts/agent/application/ports/AgentMessageDeliveryPort'
import { AgentMessageMailbox } from '../../../../src/contexts/agent/application/services/AgentMessageMailbox'

const scope = { projectId: 'project', workspaceId: 'workspace' }
const sender = { ...scope, agentId: 'writer', sessionId: 'writer-session' }
const recipient = { ...scope, agentId: 'reviewer', sessionId: 'reviewer-session' }
const task = {
  messageId: 'review-1',
  toAgentId: recipient.agentId,
  kind: 'task' as const,
  text: 'Review the supplied revision.'
}

describe('Native Agent inbox delivery', () => {
  afterEach(() => vi.useRealTimers())

  it.each([false, true])(
    'returns an empty inbox immediately without a waiting timer: native=%s',
    async (native) => {
      vi.useFakeTimers()
      const mailbox = new AgentMessageMailbox()
      const lease = mailbox.registerDelivery(recipient, () => readyState)
      lease.setWakeup(native ? { notify: async () => undefined } : null)
      let result: unknown
      const read = mailbox.wait(recipient, native ? { timeoutMs: 45_000 } : {}).then((value) => {
        result = value
      })
      try {
        await Promise.resolve()
        expect(result).toEqual({ status: 'empty' })
        expect(mailbox.isWaiting(recipient)).toBe(false)
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        mailbox.closeSession(recipient.sessionId)
        await read
        await lease.dispose()
      }
    }
  )

  it.each(['before reading', 'while reading'])(
    'coalesces notifications for messages arriving %s',
    async (arrival) => {
      const mailbox = new AgentMessageMailbox()
      const notify = vi.fn(async () => undefined)
      const lease = mailbox.registerDelivery(recipient, () => readyState)
      lease.setWakeup({ notify })
      mailbox.send(sender, task)
      await lease.settle()
      if (arrival === 'while reading') await mailbox.wait(recipient, { timeoutMs: 0 })
      mailbox.send(sender, { ...task, messageId: 'review-2' })
      await lease.settle()
      expect(notify).toHaveBeenCalledTimes(1)
      await mailbox.wait(recipient, { timeoutMs: 0 })
      expect(
        await mailbox.wait(recipient, { acknowledgeMessageId: task.messageId, timeoutMs: 0 })
      ).toMatchObject({ message: { messageId: 'review-2' } })
      await mailbox.wait(recipient, { acknowledgeMessageId: 'review-2', timeoutMs: 0 })
      mailbox.send(sender, { ...task, messageId: 'review-3' })
      await lease.settle()
      expect(notify).toHaveBeenCalledTimes(2)
      await lease.dispose()
    }
  )

  it('retains messages arriving during native notification without queuing another reminder', async () => {
    const mailbox = new AgentMessageMailbox()
    let accept!: () => void
    const notify = vi
      .fn<AgentMessageWakeupPort['notify']>()
      .mockResolvedValue(undefined)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            accept = resolve
          })
      )
    const lease = mailbox.registerDelivery(recipient, () => readyState)
    lease.setWakeup({ notify })
    mailbox.send(sender, task)
    await Promise.resolve()
    mailbox.send(sender, { ...task, messageId: 'review-2' })
    accept()
    await lease.settle()
    expect(notify).toHaveBeenCalledTimes(1)
    // The first notification covers the entire inbox, including the new message.
    await mailbox.wait(recipient, { timeoutMs: 0 })
    expect(
      await mailbox.wait(recipient, { acknowledgeMessageId: task.messageId, timeoutMs: 0 })
    ).toMatchObject({ message: { messageId: 'review-2' } })
    await mailbox.wait(recipient, { acknowledgeMessageId: 'review-2', timeoutMs: 0 })
    await lease.dispose()
  })

  it('releases an unfinished inbox read at turn completion so later work can wake the Agent', async () => {
    const mailbox = new AgentMessageMailbox()
    const notify = vi.fn(async () => undefined)
    const lease = mailbox.registerDelivery(recipient, () => readyState)
    lease.setWakeup({ notify })
    mailbox.send(sender, task)
    await lease.settle()
    await mailbox.wait(recipient, { timeoutMs: 0 })
    mailbox.send(sender, { ...task, messageId: 'after-turn' })
    await lease.settle()
    expect(notify).toHaveBeenCalledTimes(1)
    lease.completeTurn()
    await lease.settle()
    expect(notify).toHaveBeenCalledTimes(2)
    await lease.dispose()
  })

  it('does not queue a second reminder when the preceding unrelated turn completes', async () => {
    const mailbox = new AgentMessageMailbox()
    const notify = vi.fn(async () => undefined)
    const lease = mailbox.registerDelivery(recipient, () => readyState)
    lease.setWakeup({ notify, canQueueWhileBusy: true })
    mailbox.send(sender, task)
    await lease.settle()
    lease.completeTurn()
    mailbox.send(sender, { ...task, messageId: 'another-task' })
    await lease.settle()
    expect(notify).toHaveBeenCalledTimes(1)
    await lease.dispose()
  })

  it('releases retries once the Agent has accepted the pending messages', async () => {
    vi.useFakeTimers()
    const mailbox = new AgentMessageMailbox()
    const notify = vi
      .fn<AgentMessageWakeupPort['notify']>()
      .mockRejectedValue(new Error('transport failed'))
    const lease = mailbox.registerDelivery(recipient, () => readyState)
    lease.setWakeup({ notify })
    mailbox.send(sender, task)
    await lease.settle()
    await mailbox.wait(recipient, {})
    await mailbox.wait(recipient, { acknowledgeMessageId: task.messageId })
    expect(vi.getTimerCount()).toBe(0)
    notify.mockResolvedValue(undefined)
    mailbox.send(sender, { ...task, messageId: 'after-drain' })
    await lease.settle()
    expect(notify).toHaveBeenCalledTimes(2)
    await lease.dispose()
  })

  it('ignores late acceptance of a drained notification and wakes for the next task', async () => {
    const mailbox = new AgentMessageMailbox()
    let accept!: () => void
    const notify = vi
      .fn<AgentMessageWakeupPort['notify']>()
      .mockResolvedValue(undefined)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            accept = resolve
          })
      )
    const lease = mailbox.registerDelivery(recipient, () => readyState)
    lease.setWakeup({ notify })
    mailbox.send(sender, task)
    await Promise.resolve()
    await mailbox.wait(recipient, {})
    await mailbox.wait(recipient, { acknowledgeMessageId: task.messageId })
    expect(notify.mock.calls[0]![0].signal.aborted).toBe(true)
    mailbox.send(sender, { ...task, messageId: 'next-task' })
    accept()
    await lease.settle()
    expect(notify).toHaveBeenCalledTimes(2)
    expect(await mailbox.wait(recipient, {})).toMatchObject({ message: { messageId: 'next-task' } })
    await lease.dispose()
  })

  it.each(['existing idle Agent', 'message before launch', 'restored launch'])(
    'delivers through the same inbox for %s',
    async (origin) => {
      const mailbox = new AgentMessageMailbox()
      if (origin !== 'existing idle Agent') mailbox.send(sender, task)
      if (origin === 'restored launch') {
        const previous = mailbox.registerDelivery(recipient, () => readyState)
        await previous.dispose()
      }
      const notify = vi.fn(async () => undefined)
      const lease = mailbox.registerDelivery(recipient, () => readyState)
      lease.setWakeup({ notify })
      if (origin === 'existing idle Agent') mailbox.send(sender, task)
      await lease.settle()

      expect(notify).toHaveBeenCalledTimes(1)
      expect(mailbox.deliveryStatus(recipient)).toBe('notified')
      expect(await mailbox.wait(recipient, { timeoutMs: 0 })).toMatchObject({
        status: 'message',
        message: { ...task, fromAgentId: sender.agentId }
      })
      await lease.dispose()
    }
  )

  it('waits for MCP readiness and an idle native session without consuming the message', async () => {
    const mailbox = new AgentMessageMailbox()
    let state = { ...readyState, mcpReady: false }
    const notify = vi.fn(async () => undefined)
    const lease = mailbox.registerDelivery(recipient, () => state)
    lease.setWakeup({ notify, canNotifyWhileWaitingForInput: true })
    mailbox.send(sender, task)
    await lease.settle()
    expect(notify).not.toHaveBeenCalled()
    expect(mailbox.deliveryStatus(recipient)).toBe('pending')

    state = { ...readyState, activity: 'waiting_approval' }
    lease.refresh()
    expect(mailbox.deliveryStatus(recipient)).toBe('busy')
    state = readyState
    lease.refresh()
    await lease.settle()
    expect(notify).toHaveBeenCalledTimes(1)
    await lease.dispose()
  })

  it('uses an existing MCP wait without also waking the CLI', async () => {
    const mailbox = new AgentMessageMailbox()
    const notify = vi.fn(async () => undefined)
    const lease = mailbox.registerDelivery(recipient, () => readyState)
    const waiting = mailbox.wait(recipient, { timeoutMs: 1_000 })
    lease.setWakeup({ notify })
    expect(mailbox.deliveryStatus(recipient)).toBe('waiting')
    mailbox.send(sender, task)
    expect(await waiting).toMatchObject({ status: 'message' })
    await lease.settle()
    expect(notify).not.toHaveBeenCalled()
    await lease.dispose()
  })

  it.each([false, true])(
    'requires native opt-in to notify a session waiting for input: %s',
    async (allowed) => {
      const mailbox = new AgentMessageMailbox()
      const notify = vi.fn(async () => undefined)
      const state: AgentMessageDeliveryState = { ...readyState, activity: 'waiting_input' }
      const lease = mailbox.registerDelivery(recipient, () => state)
      lease.setWakeup({ notify, canNotifyWhileWaitingForInput: allowed })
      mailbox.send(sender, task)
      await lease.settle()
      expect(notify).toHaveBeenCalledTimes(allowed ? 1 : 0)
      expect(mailbox.deliveryStatus(recipient)).toBe(allowed ? 'notified' : 'busy')
      await lease.dispose()
    }
  )

  it('cancels a scheduled notification if the peer pulls the message first', async () => {
    const mailbox = new AgentMessageMailbox()
    const notify = vi.fn(async () => undefined)
    const lease = mailbox.registerDelivery(recipient, () => readyState)
    lease.setWakeup({ notify })
    mailbox.send(sender, task)
    await mailbox.wait(recipient, { timeoutMs: 0 })
    await lease.settle()
    expect(notify).not.toHaveBeenCalled()
    await lease.dispose()
  })

  it('rechecks busy state before invoking the native transport', async () => {
    const mailbox = new AgentMessageMailbox()
    let state = readyState
    const notify = vi.fn(async () => undefined)
    const lease = mailbox.registerDelivery(recipient, () => state)
    lease.setWakeup({ notify })
    mailbox.send(sender, task)
    state = { ...state, activity: 'waiting_approval' }
    await lease.settle()
    expect(notify).not.toHaveBeenCalled()
    state = readyState
    lease.refresh()
    await lease.settle()
    expect(notify).toHaveBeenCalledTimes(1)
    await lease.dispose()
  })

  it('does not notify again for a read message or an identical send, but wakes for subsequent work', async () => {
    const mailbox = new AgentMessageMailbox()
    const notify = vi.fn(async () => undefined)
    const lease = mailbox.registerDelivery(recipient, () => readyState)
    lease.setWakeup({ notify })
    mailbox.send(sender, task)
    await lease.settle()
    await mailbox.wait(recipient, { timeoutMs: 0 })
    mailbox.send(sender, task)
    lease.refresh()
    await lease.settle()
    expect(notify).toHaveBeenCalledTimes(1)
    await mailbox.wait(recipient, { acknowledgeMessageId: task.messageId, timeoutMs: 0 })
    mailbox.send(sender, { ...task, messageId: 'review-2' })
    await lease.settle()
    expect(notify).toHaveBeenCalledTimes(2)
    await lease.dispose()
  })

  it('revokes an old launch before replacement and ignores its late completion', async () => {
    const mailbox = new AgentMessageMailbox()
    let complete!: () => void
    const signals: AbortSignal[] = []
    const previousNotify = vi.fn((command: Parameters<AgentMessageWakeupPort['notify']>[0]) => {
      signals.push(command.signal)
      return new Promise<void>((resolve) => {
        complete = resolve
      })
    })
    const previous = mailbox.registerDelivery(recipient, () => readyState)
    previous.setWakeup({ notify: previousNotify })
    mailbox.send(sender, task)
    await Promise.resolve()
    const current = mailbox.registerDelivery(recipient, () => readyState)
    const notify = vi.fn(async () => undefined)
    current.setWakeup({ notify })
    expect(signals[0]!.aborted).toBe(true)
    complete()
    await previous.dispose()
    await current.settle()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(mailbox.deliveryStatus(recipient)).toBe('notified')
    await current.dispose()
    expect(mailbox.deliveryStatus(recipient)).toBe('offline')
  })

  it('retries a failed notification without losing the message and cancels retries on close', async () => {
    vi.useFakeTimers()
    const mailbox = new AgentMessageMailbox()
    const notify = vi.fn(async () => {
      throw new Error('native transport unavailable')
    })
    const lease = mailbox.registerDelivery(recipient, () => readyState)
    lease.setWakeup({ notify })
    mailbox.send(sender, task)
    await lease.settle()
    expect(mailbox.deliveryStatus(recipient)).toBe('failed')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(notify.mock.calls.length).toBeGreaterThan(1)
    await lease.dispose()
    const attempts = notify.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(notify).toHaveBeenCalledTimes(attempts)
    expect(vi.getTimerCount()).toBe(0)
    expect(await mailbox.wait(recipient, { timeoutMs: 0 })).toMatchObject({ status: 'message' })
  })

  it('keeps MCP pull communication available when native wakeup is unsupported', async () => {
    const mailbox = new AgentMessageMailbox()
    const lease = mailbox.registerDelivery(recipient, () => readyState)
    lease.setWakeup(null)
    mailbox.send(sender, task)
    expect(mailbox.deliveryStatus(recipient)).toBe('pull_only')
    expect(await mailbox.wait(recipient, { timeoutMs: 0 })).toMatchObject({ status: 'message' })
    await lease.dispose()
  })

  it('allows new work to retry a transport after its previous retry budget was exhausted', async () => {
    vi.useFakeTimers()
    const mailbox = new AgentMessageMailbox()
    const notify = vi
      .fn<AgentMessageWakeupPort['notify']>()
      .mockRejectedValue(new Error('temporarily unavailable'))
    const lease = mailbox.registerDelivery(recipient, () => readyState)
    lease.setWakeup({ notify })
    mailbox.send(sender, task)
    await lease.settle()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(notify).toHaveBeenCalledTimes(3)
    notify.mockResolvedValue(undefined)
    mailbox.send(sender, { ...task, messageId: 'after-recovery' })
    await lease.settle()
    expect(notify).toHaveBeenCalledTimes(4)
    expect(mailbox.deliveryStatus(recipient)).toBe('notified')
    await lease.dispose()
  })
})

const readyState: AgentMessageDeliveryState = { running: true, mcpReady: true, activity: 'idle' }
