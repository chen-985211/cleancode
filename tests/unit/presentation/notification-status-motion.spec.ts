import type { AppNotification } from '../../../src/presentation/shared/notifications/appNotifications'
import {
  completeNotificationStatusMotion,
  createNotificationStatusMotionState,
  synchronizeNotificationStatusMotion
} from '../../../src/presentation/app-shell/notificationStatusMotion'

describe('notification status motion', () => {
  it('keeps the previous status visual until its icon spring settles', () => {
    const running = createNotification('running', {
      isActivity: true,
      kind: 'info',
      title: '流程运行中'
    })
    const succeeded = createNotification('running', {
      kind: 'success',
      title: '流程运行成功'
    })
    const initial = createNotificationStatusMotionState({
      notification: running,
      reducedMotion: false
    })

    const updating = synchronizeNotificationStatusMotion(initial, {
      notification: succeeded,
      reducedMotion: false
    })

    expect(updating.layers).toMatchObject([
      { notification: running, phase: 'outgoing' },
      { notification: succeeded, phase: 'current' }
    ])

    const completed = completeNotificationStatusMotion(updating, updating.layers[0].id)

    expect(completed.layers).toMatchObject([{ notification: succeeded, phase: 'current' }])
  })

  it('projects only the latest status when reduced motion becomes active', () => {
    const running = createNotification('run', {
      isActivity: true,
      kind: 'info',
      title: '流程运行中'
    })
    const succeeded = createNotification('run', {
      kind: 'success',
      title: '流程运行成功'
    })
    const updating = synchronizeNotificationStatusMotion(
      createNotificationStatusMotionState({ notification: running, reducedMotion: false }),
      { notification: succeeded, reducedMotion: false }
    )

    const reduced = synchronizeNotificationStatusMotion(updating, {
      notification: succeeded,
      reducedMotion: true
    })

    expect(reduced.layers).toMatchObject([{ notification: succeeded, phase: 'current' }])
  })

  it('adopts non-status notification updates without replaying the status transition', () => {
    const stop = vi.fn()
    const ready = createNotification('run', {
      action: { icon: 'stop', label: '停止', onClick: stop },
      isActivity: true,
      kind: 'info',
      source: { label: '从“依赖就绪”开始' },
      title: '流程服务已就绪'
    })
    const refreshed = createNotification('run', {
      action: { icon: 'stop', label: '停止本次运行', onClick: vi.fn() },
      isActivity: true,
      kind: 'info',
      message: '最新详情',
      source: { label: '从“依赖就绪”开始 · 涉及 2 个终端' },
      title: '流程服务已就绪'
    })

    const synchronized = synchronizeNotificationStatusMotion(
      createNotificationStatusMotionState({ notification: ready, reducedMotion: false }),
      { notification: refreshed, reducedMotion: false }
    )

    expect(synchronized.notification).toBe(refreshed)
    expect(synchronized.layers).toEqual([{ id: 0, notification: refreshed, phase: 'current' }])
    expect(synchronized.nextLayerId).toBe(1)
  })

  it.each<{
    readonly changes: Partial<Omit<AppNotification, 'id'>>
    readonly dimension: string
  }>([
    { changes: { title: '流程服务已就绪' }, dimension: 'title' },
    { changes: { kind: 'success' }, dimension: 'kind' },
    { changes: { isActivity: false }, dimension: 'activity state' },
    { changes: { leadingIcon: 'provider icon' }, dimension: 'leading icon shape' },
    {
      changes: { titleStatus: { icon: 'status icon', label: '已完成' } },
      dimension: 'title status'
    }
  ])('creates a status transition when $dimension changes', ({ changes }) => {
    const runningInput = {
      isActivity: true,
      kind: 'info' as const,
      title: '流程运行中'
    }
    const running = createNotification('run', runningInput)
    const changed = createNotification('run', { ...runningInput, ...changes })

    const synchronized = synchronizeNotificationStatusMotion(
      createNotificationStatusMotionState({ notification: running, reducedMotion: false }),
      { notification: changed, reducedMotion: false }
    )

    expect(synchronized.layers).toMatchObject([
      { notification: running, phase: 'outgoing' },
      { notification: changed, phase: 'current' }
    ])
  })
})

function createNotification(id: string, input: Omit<AppNotification, 'id'>): AppNotification {
  return { ...input, id }
}
