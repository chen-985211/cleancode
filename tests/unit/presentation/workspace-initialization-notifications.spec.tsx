import { act, renderHook } from '@testing-library/react'
import { useWorkspaceInitializationNotifications } from '../../../src/presentation/app-shell/coordinators/useWorkspaceInitializationNotifications'
import type { AppNotificationInput } from '../../../src/presentation/shared/notifications/appNotifications'
import { WorkspaceInitialization } from '../../../src/contexts/project/domain/aggregates/WorkspaceInitialization'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

function setup() {
  const workbench = createWorkbenchSnapshot('/project', 'Project')
  const operation = WorkspaceInitialization.create({
    id: 'operation',
    projectId: workbench.project.id,
    projectDirectory: '/project',
    workspaceId: workbench.graph.workspaceId,
    workspaceDirectory: '/project/feature',
    branchName: 'feature',
    mode: 'new-workspace',
    defaults: { templates: [{ templateId: 'template', runAfterPlacement: true }], agents: [] }
  })
  operation.activate()
  const notifications = {
    notify: vi.fn<(value: AppNotificationInput) => string>(() => 'notice'),
    update: vi.fn(() => true),
    dismiss: vi.fn()
  }
  const apply = vi.fn(async () => undefined)
  const hook = renderHook(() => useWorkspaceInitializationNotifications(notifications, apply))
  return { workbench, operation, notifications, apply, feedback: hook.result }
}

describe('workspace initialization notifications', () => {
  it('updates one failure notice, keeps dismissed notices closed and retries the exact source', async () => {
    const f = setup()
    const item = f.operation.toSnapshot().items[0]
    f.operation.fail(item.id, 'UNEXPECTED_ERROR')
    const snapshot = f.operation.toSnapshot()
    act(() => {
      f.feedback.current.report(f.workbench, snapshot)
      f.feedback.current.report(f.workbench, snapshot)
    })
    expect(f.notifications.notify).toHaveBeenCalledOnce()
    const notice = f.notifications.notify.mock.calls[0][0]
    expect(notice.source).toEqual({ label: 'Project', detail: 'feature' })
    await act(async () => notice.action!.onClick())
    expect(f.apply).toHaveBeenCalledWith(f.workbench, { retryItemId: item.id })
    f.notifications.update.mockReturnValue(false)
    act(() => f.feedback.current.report(f.workbench, snapshot, true))
    expect(f.notifications.update).toHaveBeenCalledOnce()
    expect(f.notifications.notify).toHaveBeenCalledOnce()
    f.operation.skip(item.id)
    act(() => f.feedback.current.report(f.workbench, f.operation.toSnapshot()))
    expect(f.notifications.dismiss).toHaveBeenCalledWith('notice')
  })

  it('announces live cleanup once and keeps restored cleanup records quiet', () => {
    const f = setup()
    f.operation.discardUnavailableTemplate(
      f.operation.toSnapshot().items[0].id,
      'BLOCK_TEMPLATE_NOT_FOUND'
    )
    const snapshot = f.operation.toSnapshot()
    act(() => f.feedback.current.report(f.workbench, snapshot))
    expect(f.notifications.notify).not.toHaveBeenCalled()
    act(() => {
      f.feedback.current.report(f.workbench, snapshot, false, null, true)
      f.feedback.current.report(f.workbench, snapshot, false, null, true)
    })
    expect(f.notifications.notify).toHaveBeenCalledOnce()
    expect(f.notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'info',
        title: '已清理 1 个失效模板',
        autoDismissMs: 4000
      })
    )
  })

  it('explains uncertain launches without offering automatic replay', () => {
    const f = setup()
    const item = f.operation.toSnapshot().items[0]
    f.operation.created(item.id, {
      objectIds: ['terminal'],
      executionTarget: { type: 'block-set', blockIds: ['terminal'] }
    })
    f.operation.requestRun(item.id)
    f.operation.interrupt()
    act(() => f.feedback.current.report(f.workbench, f.operation.toSnapshot()))
    const notice = f.notifications.notify.mock.calls[0][0]
    expect(notice.message).toContain('手动运行')
    expect(notice.action).toBeUndefined()
    expect(f.apply).not.toHaveBeenCalled()
  })
})
