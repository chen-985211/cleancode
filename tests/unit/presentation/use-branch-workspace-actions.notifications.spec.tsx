import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'

import type {
  AppNotificationController,
  AppNotificationInput
} from '../../../src/presentation/shared/notifications/appNotifications'
import { createExpectedAppError } from '../../../src/shared-kernel/application/errors/AppError'
import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'
import { useI18n } from '../../../src/presentation/i18n/useI18n'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import { useBranchWorkspaceActions } from '../../../src/presentation/app-shell/useBranchWorkspaceActions'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('branch workspace action notifications', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('routes every rejected workspace action through an independently keyed notification', async () => {
    const workbench = createWorkbench()
    const runtimeApi = createRuntimeApi({
      switchBranchWorkspace: rejectingAction('switch failed'),
      createBranchWorkspace: rejectingAction('create failed'),
      archiveBranchWorkspace: rejectingAction('archive failed'),
      checkoutMainWorkspaceBranch: rejectingAction('checkout failed')
    })
    const notifications = createNotifications()
    Object.defineProperty(window, 'cleancode', { configurable: true, value: runtimeApi })
    const { result } = renderBranchWorkspaceActions(workbench, notifications)

    await act(() => result.current.selectWorkspace(workbench, 'feature-alpha'))
    await act(() => result.current.createBranchWorkspace(workbench, 'feature/new'))
    await act(() => result.current.archiveBranchWorkspace(workbench, 'feature-alpha'))
    await act(() => result.current.checkoutMainBranch(workbench, 'feature/free'))

    expect(notifications.notify.mock.calls.map(([notification]) => notification)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identity: expect.objectContaining({
            key: 'workspace:project-alpha-project:feature-alpha:select'
          }),
          message: '无法切换工作区。',
          title: '切换工作区失败'
        }),
        expect.objectContaining({
          identity: expect.objectContaining({
            key: 'workspace:project-alpha-project:create'
          }),
          message: '无法创建分支工作区。',
          title: '创建分支工作区失败'
        }),
        expect.objectContaining({
          identity: expect.objectContaining({
            key: 'workspace:project-alpha-project:feature-alpha:archive'
          }),
          message: '无法归档工作区。',
          title: '归档工作区失败'
        }),
        expect.objectContaining({
          identity: expect.objectContaining({
            key: 'workspace:project-alpha-project:checkout-main'
          }),
          message: '无法切换默认工作区分支。',
          title: '切换分支失败'
        })
      ])
    )
    const occurrenceIds = notifications.notify.mock.calls.map(
      ([notification]) => notification.identity?.occurrenceId
    )
    expect(occurrenceIds.every(Boolean)).toBe(true)
    expect(new Set(occurrenceIds).size).toBe(4)
  })

  it('reports whether a workspace selection was selected, failed, or superseded', async () => {
    const workbench = createWorkbench()
    const firstAttempt = createDeferred<ReturnType<typeof createWorkbench>>()
    const secondAttempt = createDeferred<ReturnType<typeof createWorkbench>>()
    const switchBranchWorkspace = vi
      .fn()
      .mockRejectedValueOnce(new Error('switch failed'))
      .mockImplementationOnce(() => firstAttempt.promise)
      .mockImplementationOnce(() => secondAttempt.promise)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ switchBranchWorkspace })
    })
    const { result } = renderBranchWorkspaceActions(workbench, createNotifications())

    await expect(
      result.current.selectWorkspaceWithResult(workbench, 'feature-alpha')
    ).resolves.toBe('failed')

    const older = result.current.selectWorkspaceWithResult(workbench, 'feature-alpha')
    const newer = result.current.selectWorkspaceWithResult(workbench, 'feature-beta')
    secondAttempt.resolve(workbench)
    await expect(newer).resolves.toBe('selected')
    firstAttempt.resolve(workbench)
    await expect(older).resolves.toBe('superseded')
  })

  it('clears only the matching previous error when a new attempt succeeds', async () => {
    const workbench = createWorkbench()
    const switched = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const switchBranchWorkspace = vi
      .fn()
      .mockRejectedValueOnce(new Error('switch failed'))
      .mockResolvedValueOnce(switched)
    const createBranchWorkspace = vi
      .fn()
      .mockRejectedValueOnce(
        createExpectedAppError('BRANCH_WORKSPACE_NOT_FOUND', 'workspace missing')
      )
      .mockResolvedValueOnce(switched)
    const notifications = createNotifications()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ switchBranchWorkspace, createBranchWorkspace })
    })
    const { result } = renderBranchWorkspaceActions(workbench, notifications)

    await act(() => result.current.selectWorkspace(workbench, 'feature-alpha'))
    await act(() => result.current.createBranchWorkspace(workbench, 'feature/new'))
    await act(() => result.current.selectWorkspace(workbench, 'feature-alpha'))

    expect(notifications.dismiss).toHaveBeenCalledWith(
      'workspace:project-alpha-project:feature-alpha:select'
    )
    expect(notifications.dismiss).not.toHaveBeenCalledWith('workspace:project-alpha-project:create')

    await act(() => result.current.createBranchWorkspace(workbench, 'feature/new'))
    expect(notifications.dismiss).toHaveBeenCalledWith('workspace:project-alpha-project:create')
  })

  it('does not let an older failure replace the result of a newer successful attempt', async () => {
    const workbench = createWorkbench()
    const firstAttempt = createDeferred<ReturnType<typeof createWorkbench>>()
    const secondAttempt = createDeferred<ReturnType<typeof createWorkbench>>()
    const switchBranchWorkspace = vi
      .fn()
      .mockImplementationOnce(() => firstAttempt.promise)
      .mockImplementationOnce(() => secondAttempt.promise)
    const notifications = createNotifications()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ switchBranchWorkspace })
    })
    const { result } = renderBranchWorkspaceActions(workbench, notifications)
    let firstRun!: Promise<void>
    let secondRun!: Promise<void>

    act(() => {
      firstRun = result.current.selectWorkspace(workbench, 'feature-alpha')
      secondRun = result.current.selectWorkspace(workbench, 'feature-alpha')
    })
    await act(async () => {
      secondAttempt.resolve(workbench)
      await secondRun
    })
    await act(async () => {
      firstAttempt.reject(new Error('older attempt failed'))
      await firstRun
    })

    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it('does not let an older successful attempt replace a newer workspace result', async () => {
    const workbench = createWorkbench()
    const olderWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'older-result')
    const newerWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'newer-result')
    const firstAttempt = createDeferred<ReturnType<typeof createWorkbench>>()
    const secondAttempt = createDeferred<ReturnType<typeof createWorkbench>>()
    const switchBranchWorkspace = vi
      .fn()
      .mockImplementationOnce(() => firstAttempt.promise)
      .mockImplementationOnce(() => secondAttempt.promise)
    const notifications = createNotifications()
    const replaceWorkbench = vi.fn()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ switchBranchWorkspace })
    })
    const { result } = renderBranchWorkspaceActions(workbench, notifications, {
      replaceWorkbench
    })
    let firstRun!: Promise<void>
    let secondRun!: Promise<void>

    act(() => {
      firstRun = result.current.selectWorkspace(workbench, 'feature-alpha')
      secondRun = result.current.selectWorkspace(workbench, 'feature-alpha')
    })
    await act(async () => {
      secondAttempt.resolve(newerWorkbench)
      await secondRun
    })
    await act(async () => {
      firstAttempt.resolve(olderWorkbench)
      await firstRun
    })

    expect(replaceWorkbench).toHaveBeenCalledOnce()
    expect(replaceWorkbench).toHaveBeenCalledWith(newerWorkbench)
  })

  it('fences an older selection when a different workspace becomes the current target', async () => {
    const workbench = createWorkbench()
    const olderWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'older-result')
    const newerWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'newer-result')
    const firstAttempt = createDeferred<ReturnType<typeof createWorkbench>>()
    const secondAttempt = createDeferred<ReturnType<typeof createWorkbench>>()
    const switchBranchWorkspace = vi
      .fn()
      .mockImplementationOnce(() => firstAttempt.promise)
      .mockImplementationOnce(() => secondAttempt.promise)
    const notifications = createNotifications()
    const replaceWorkbench = vi.fn()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ switchBranchWorkspace })
    })
    const { result } = renderBranchWorkspaceActions(workbench, notifications, {
      replaceWorkbench
    })
    let firstRun!: Promise<void>
    let secondRun!: Promise<void>

    act(() => {
      firstRun = result.current.selectWorkspace(workbench, 'feature-alpha')
      secondRun = result.current.selectWorkspace(workbench, 'feature-beta')
    })
    await act(async () => {
      secondAttempt.resolve(newerWorkbench)
      await secondRun
    })
    await act(async () => {
      firstAttempt.resolve(olderWorkbench)
      await firstRun
    })

    expect(replaceWorkbench).toHaveBeenCalledOnce()
    expect(replaceWorkbench).toHaveBeenCalledWith(newerWorkbench)
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it('invalidates an in-flight selection when the target is already current', async () => {
    const workbench = createWorkbench()
    const currentFeatureWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranch: 'feature/alpha',
      workspaceDirectory: '/tmp/alpha-feature',
      workspaceId: 'feature-alpha',
      workspaces: workbench.project.workspaces.map((workspace) => ({
        ...workspace,
        isCurrent: workspace.workspaceId === 'feature-alpha'
      }))
    })
    const staleResult = createWorkbenchSnapshot('/tmp/alpha-project', 'stale-result')
    const pendingAttempt = createDeferred<ReturnType<typeof createWorkbench>>()
    const switchBranchWorkspace = vi.fn(() => pendingAttempt.promise)
    const notifications = createNotifications()
    const replaceWorkbench = vi.fn()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ switchBranchWorkspace })
    })
    const { result, rerender } = renderHook(
      ({ currentWorkbench }) => {
        const actions = useBranchWorkspaceActions({
          currentWorkbench,
          forgetWorkspaceTerminalStates: vi.fn(),
          notifications,
          replaceWorkbench,
          setHoveredTerminalBlockId: vi.fn(),
          setSelectedTerminalBlockId: vi.fn(),
          terminateWorkspaceTerminalSessions: vi.fn(async () => undefined)
        })

        return actions
      },
      {
        initialProps: { currentWorkbench: workbench },
        wrapper: ({ children }: { readonly children: ReactNode }) => (
          <I18nProvider initialLocale="zh-CN">{children}</I18nProvider>
        )
      }
    )
    let staleRun!: Promise<void>

    act(() => {
      staleRun = result.current.selectWorkspace(workbench, 'feature-alpha')
    })
    rerender({ currentWorkbench: currentFeatureWorkbench })
    await act(() => result.current.selectWorkspace(currentFeatureWorkbench, 'feature-alpha'))
    await act(async () => {
      pendingAttempt.resolve(staleResult)
      await staleRun
    })

    expect(switchBranchWorkspace).toHaveBeenCalledOnce()
    expect(replaceWorkbench).not.toHaveBeenCalled()
  })

  it('retranslates only the retained current workspace error', async () => {
    const workbench = createWorkbench()
    const nextAttempt = createDeferred<ReturnType<typeof createWorkbench>>()
    const createBranchWorkspace = vi
      .fn()
      .mockRejectedValueOnce(
        createExpectedAppError('BRANCH_WORKSPACE_NOT_FOUND', 'workspace missing')
      )
      .mockImplementationOnce(() => nextAttempt.promise)
    const notifications = createNotifications()
    notifications.update.mockReturnValue(true)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ createBranchWorkspace })
    })
    const { result } = renderBranchWorkspaceActions(workbench, notifications)

    await act(() => result.current.createBranchWorkspace(workbench, 'feature/new'))
    const published = notifications.notify.mock.calls[0]?.[0]

    act(() => result.current.selectLocale('en'))

    expect(notifications.update).toHaveBeenLastCalledWith(
      'workspace:project-alpha-project:create',
      {
        identity: {
          key: 'workspace:project-alpha-project:create',
          occurrenceId: published?.identity?.occurrenceId
        },
        kind: 'error',
        message: 'The branch workspace does not exist. Refresh and try again.',
        title: 'Could not create branch workspace'
      }
    )

    let nextRun!: Promise<void>
    act(() => {
      nextRun = result.current.createBranchWorkspace(workbench, 'feature/newer')
    })
    notifications.update.mockClear()
    act(() => result.current.selectLocale('zh-CN'))

    expect(notifications.update).not.toHaveBeenCalled()

    await act(async () => {
      nextAttempt.resolve(workbench)
      await nextRun
    })
  })
})

function renderBranchWorkspaceActions(
  workbench: ReturnType<typeof createWorkbench>,
  notifications: ReturnType<typeof createNotifications>,
  overrides: {
    readonly replaceWorkbench?: (workbench: WorkbenchSnapshot) => void
  } = {}
) {
  return renderHook(
    () => {
      const actions = useBranchWorkspaceActions({
        currentWorkbench: workbench,
        forgetWorkspaceTerminalStates: vi.fn(),
        notifications,
        replaceWorkbench: overrides.replaceWorkbench ?? vi.fn(),
        setHoveredTerminalBlockId: vi.fn(),
        setSelectedTerminalBlockId: vi.fn(),
        terminateWorkspaceTerminalSessions: vi.fn(async () => undefined)
      })
      const { selectLocale } = useI18n()

      return { ...actions, selectLocale }
    },
    {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <I18nProvider initialLocale="zh-CN">{children}</I18nProvider>
      )
    }
  )
}

function createWorkbench() {
  return createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
    gitBranch: 'main',
    workspaces: [
      {
        workspaceId: 'main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/tmp/alpha-project',
        gitBranch: 'main',
        isCurrent: true
      },
      {
        workspaceId: 'feature-alpha',
        workspaceKind: 'linked-worktree',
        displayName: 'feature/alpha',
        directory: '/tmp/alpha-feature',
        gitBranch: 'feature/alpha',
        isCurrent: false
      }
    ]
  })
}

function rejectingAction(message: string) {
  return vi.fn(async () => {
    throw new Error(message)
  })
}

function createNotifications() {
  const notify = vi.fn(
    (notification: AppNotificationInput & { identity?: { key: string; occurrenceId: string } }) =>
      notification.identity ? notification.identity.key : 'notification'
  )

  return {
    dismiss: vi.fn(),
    notify,
    update: vi.fn(() => false)
  } satisfies AppNotificationController
}

function createDeferred<TResult>() {
  let resolve!: (value: TResult) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<TResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}
