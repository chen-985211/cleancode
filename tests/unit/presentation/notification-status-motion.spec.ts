import type { AppNotification } from '../../../src/presentation/app-shell/appNotifications'
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
})

function createNotification(id: string, input: Omit<AppNotification, 'id'>): AppNotification {
  return { ...input, id }
}
