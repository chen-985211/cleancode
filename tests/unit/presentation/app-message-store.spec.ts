import {
  completeAppMessageExit,
  createAppMessageStore,
  dismissAppMessage,
  publishAppMessage,
  updateAppMessage
} from '../../../src/presentation/app-shell/appMessageStore'

describe('app message store', () => {
  it('updates the same semantic occurrence in place without adding another message', () => {
    const first = publishAppMessage(createAppMessageStore(), {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1' },
      kind: 'info',
      message: '正在处理',
      title: 'Agent 正在回答'
    })

    const repeated = publishAppMessage(first.store, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1' },
      kind: 'success',
      message: '回答已完成',
      title: 'Agent 已完成'
    })

    expect(repeated.notificationId).toBe(first.notificationId)
    expect(repeated.store.messages).toHaveLength(1)
    expect(repeated.store.messages[0]).toMatchObject({
      phase: 'open',
      notification: {
        id: first.notificationId,
        kind: 'success',
        message: '回答已完成',
        title: 'Agent 已完成'
      }
    })
  })

  it('keeps an acknowledged occurrence hidden and reopens the message for a new occurrence', () => {
    const first = publishAppMessage(createAppMessageStore(), {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 1 },
      kind: 'success',
      title: 'Agent 已完成'
    })
    const closing = dismissAppMessage(first.store, first.notificationId)
    const exitToken = closing.messages[0]?.exitToken

    expect(exitToken).toBeDefined()

    const hidden = completeAppMessageExit(closing, first.notificationId, exitToken!)
    const repeated = publishAppMessage(hidden, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 2 },
      kind: 'success',
      title: 'Agent 已完成（重复）'
    })

    expect(repeated.notificationId).toBe(first.notificationId)
    expect(repeated.store.messages).toHaveLength(1)
    expect(repeated.store.messages[0]).toMatchObject({
      phase: 'hidden',
      notification: { title: 'Agent 已完成（重复）' }
    })

    const nextOccurrence = publishAppMessage(repeated.store, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-2', revision: 1 },
      kind: 'info',
      title: 'Agent 正在回答新消息'
    })

    expect(nextOccurrence.notificationId).toBe(first.notificationId)
    expect(nextOccurrence.store.messages).toHaveLength(1)
    expect(nextOccurrence.store.messages[0]).toMatchObject({
      phase: 'open',
      notification: { title: 'Agent 正在回答新消息' }
    })
  })

  it('ignores a stale revision within the same occurrence', () => {
    const current = publishAppMessage(createAppMessageStore(), {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 2 },
      kind: 'success',
      title: 'Agent 已完成'
    })

    const stale = publishAppMessage(current.store, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 1 },
      kind: 'info',
      title: 'Agent 正在回答'
    })

    expect(stale.notificationId).toBe(current.notificationId)
    expect(stale.store).toBe(current.store)
    expect(stale.store.messages[0]?.notification.title).toBe('Agent 已完成')
  })

  it('does not let a stale exit completion remove a reopened occurrence', () => {
    const first = publishAppMessage(createAppMessageStore(), {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1' },
      kind: 'success',
      title: 'Agent 已完成'
    })
    const closingFirst = dismissAppMessage(first.store, first.notificationId)
    const staleExitToken = closingFirst.messages[0]?.exitToken
    const reopened = publishAppMessage(closingFirst, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-2' },
      kind: 'info',
      title: 'Agent 正在回答新消息'
    })
    const closingSecond = dismissAppMessage(reopened.store, reopened.notificationId)

    expect(staleExitToken).toBeDefined()
    expect(closingSecond.messages[0]?.exitToken).not.toBe(staleExitToken)

    const afterStaleExit = completeAppMessageExit(
      closingSecond,
      reopened.notificationId,
      staleExitToken!
    )

    expect(afterStaleExit.messages).toHaveLength(1)
    expect(afterStaleExit.messages[0]).toMatchObject({
      phase: 'closing',
      notification: { title: 'Agent 正在回答新消息' }
    })
  })

  it('does not reopen an acknowledged occurrence after a newer occurrence replaces it', () => {
    const first = publishAppMessage(createAppMessageStore(), {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 1 },
      kind: 'success',
      title: 'Agent 已完成第一轮'
    })
    const closing = dismissAppMessage(first.store, first.notificationId)
    const second = publishAppMessage(closing, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-2', revision: 2 },
      kind: 'success',
      title: 'Agent 已完成第二轮'
    })

    const lateFirst = publishAppMessage(second.store, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 1 },
      kind: 'success',
      title: '迟到的第一轮完成消息'
    })

    expect(lateFirst.store).toBe(second.store)
    expect(lateFirst.store.messages).toHaveLength(1)
    expect(lateFirst.store.messages[0]).toMatchObject({
      phase: 'open',
      notification: { title: 'Agent 已完成第二轮' }
    })
  })

  it('does not let a superseded open occurrence replace the current occurrence', () => {
    const first = publishAppMessage(createAppMessageStore(), {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1' },
      kind: 'warning',
      title: '第一轮等待输入'
    })
    const second = publishAppMessage(first.store, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-2' },
      kind: 'success',
      title: '第二轮已完成'
    })

    const lateFirst = publishAppMessage(second.store, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1' },
      kind: 'warning',
      title: '迟到的第一轮等待输入'
    })

    expect(lateFirst.store).toBe(second.store)
    expect(lateFirst.store.messages[0]?.notification.title).toBe('第二轮已完成')
  })

  it('rejects an update retained by an older semantic occurrence', () => {
    const first = publishAppMessage(createAppMessageStore(), {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 1 },
      kind: 'warning',
      title: '第一轮等待输入'
    })
    const second = publishAppMessage(first.store, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-2', revision: 2 },
      kind: 'success',
      title: '第二轮已完成'
    })

    const staleUpdate = updateAppMessage(second.store, first.notificationId, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 3 },
      kind: 'warning',
      title: '迟到的第一轮更新'
    })

    expect(staleUpdate.updated).toBe(false)
    expect(staleUpdate.store).toBe(second.store)
    expect(staleUpdate.store.messages[0]?.notification.title).toBe('第二轮已完成')
  })

  it('allows same-revision retranslation but rejects an older semantic revision', () => {
    const current = publishAppMessage(createAppMessageStore(), {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 2 },
      kind: 'success',
      title: 'Agent 已完成'
    })

    const translated = updateAppMessage(current.store, current.notificationId, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 2 },
      kind: 'success',
      title: 'Agent completed'
    })
    const stale = updateAppMessage(translated.store, current.notificationId, {
      identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 1 },
      kind: 'info',
      title: 'Agent is working'
    })

    expect(translated.updated).toBe(true)
    expect(translated.store.messages[0]?.notification.title).toBe('Agent completed')
    expect(stale.updated).toBe(false)
    expect(stale.store).toBe(translated.store)
  })

  it('bounds hidden messages and acknowledged occurrence history', () => {
    const historyLimit = 256
    let store = createAppMessageStore()

    for (let index = 0; index <= historyLimit; index += 1) {
      const published = publishAppMessage(store, {
        identity: { key: `semantic:${index}`, occurrenceId: `occurrence:${index}` },
        kind: 'info',
        title: `消息 ${index}`
      })
      const closing = dismissAppMessage(published.store, published.notificationId)
      store = completeAppMessageExit(
        closing,
        published.notificationId,
        closing.messages.find(({ notification }) => notification.id === published.notificationId)
          ?.exitToken ?? -1
      )
    }

    expect(store.messages).toHaveLength(historyLimit)
    expect(store.semanticTombstones).toHaveLength(historyLimit)
    expect(store.messages.every(({ phase }) => phase === 'hidden')).toBe(true)

    const newestReplay = publishAppMessage(store, {
      identity: {
        key: `semantic:${historyLimit}`,
        occurrenceId: `occurrence:${historyLimit}`
      },
      kind: 'info',
      title: '迟到的新近消息'
    })
    expect(newestReplay.store.messages.filter(({ phase }) => phase === 'open')).toHaveLength(0)

    const expiredReplay = publishAppMessage(store, {
      identity: { key: 'semantic:0', occurrenceId: 'occurrence:0' },
      kind: 'info',
      title: '超过历史窗口的消息'
    })
    expect(expiredReplay.store.messages.filter(({ phase }) => phase === 'open')).toHaveLength(1)
  })
})
