import { AgentMessageMailbox } from '../../../../src/contexts/agent/application/services/AgentMessageMailbox'

const scope = { projectId: 'project', workspaceId: 'workspace' }
const sender = { ...scope, agentId: 'claude', sessionId: 'launch-claude' }
const recipient = { ...scope, agentId: 'codex', sessionId: 'launch-codex' }
const task = {
  messageId: 'review-1',
  toAgentId: 'codex',
  kind: 'task' as const,
  text: 'Review commit abc.'
}

describe('Agent message mailbox', () => {
  afterEach(() => vi.useRealTimers())

  it('delivers to a waiting native session, redelivers until acknowledged, and deduplicates retries', async () => {
    const mailbox = new AgentMessageMailbox()
    const waiting = mailbox.wait(recipient, { timeoutMs: 1_000 })
    const sent = mailbox.send(sender, task)
    expect(mailbox.send(sender, task)).toEqual(sent)
    const delivered = await waiting
    expect(delivered).toMatchObject({
      status: 'message',
      message: { ...task, fromAgentId: 'claude' }
    })
    expect(await mailbox.wait(recipient, { timeoutMs: 0 })).toEqual(delivered)
    expect(
      await mailbox.wait(recipient, { acknowledgeMessageId: task.messageId, timeoutMs: 0 })
    ).toEqual({ status: 'timeout' })
    expect(mailbox.send(sender, task)).toEqual(sent)
    expect(await mailbox.wait(recipient, { timeoutMs: 0 })).toEqual({ status: 'timeout' })
    expect(() => mailbox.send(sender, { ...task, text: 'different task' })).toThrow()
  })

  it('isolates workspace inboxes and only permits replies to a message addressed to the caller', async () => {
    const mailbox = new AgentMessageMailbox()
    mailbox.send(sender, task)
    expect(await mailbox.wait({ ...recipient, workspaceId: 'other' }, { timeoutMs: 0 })).toEqual({
      status: 'timeout'
    })
    expect(() =>
      mailbox.send(
        { ...sender, agentId: 'intruder' },
        {
          messageId: 'forged',
          toAgentId: 'claude',
          kind: 'result',
          text: 'done',
          replyToMessageId: 'review-1'
        }
      )
    ).toThrow()
    mailbox.send(recipient, {
      messageId: 'result-1',
      toAgentId: 'claude',
      kind: 'result',
      text: 'One finding.',
      replyToMessageId: 'review-1'
    })
    expect(
      await mailbox.wait(sender, { replyToMessageId: 'review-1', timeoutMs: 0 })
    ).toMatchObject({
      status: 'message',
      message: { messageId: 'result-1', fromAgentId: 'codex' }
    })
    expect(() => mailbox.wait(sender, { acknowledgeMessageId: 'review-1', timeoutMs: 0 })).toThrow()
  })

  it('cancels disconnected and closing sessions without discarding their inbox', async () => {
    const mailbox = new AgentMessageMailbox()
    const controller = new AbortController()
    const waiting = mailbox.wait(recipient, { timeoutMs: 30_000 }, controller.signal)
    controller.abort()
    expect(await waiting).toEqual({ status: 'canceled' })
    const next = mailbox.wait(recipient, { timeoutMs: 30_000 })
    mailbox.closeSession(recipient.sessionId)
    expect(await next).toEqual({ status: 'canceled' })
    mailbox.send(sender, task)
    expect(
      await mailbox.wait({ ...recipient, sessionId: 'new-launch' }, { timeoutMs: 0 })
    ).toMatchObject({ status: 'message' })
  })

  it('times out without consuming later messages and rejects concurrent inbox consumers', async () => {
    vi.useFakeTimers()
    const mailbox = new AgentMessageMailbox()
    const waiting = mailbox.wait(recipient, { timeoutMs: 1_000 })
    expect(() => mailbox.wait(recipient, { timeoutMs: 1_000 })).toThrow()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await waiting).toEqual({ status: 'timeout' })
    mailbox.send(sender, task)
    expect(await mailbox.wait(recipient, { timeoutMs: 0 })).toMatchObject({ status: 'message' })
    expect(vi.getTimerCount()).toBe(0)
  })
})
