import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'

import type {
  AppNotificationController,
  AppNotificationInput
} from '../../../src/presentation/app-shell/appNotifications'
import { createExpectedAppError } from '../../../src/shared-kernel/application/errors/AppError'
import { I18nProvider } from '../../../src/presentation/app-shell/i18n/I18nProvider'
import { useI18n } from '../../../src/presentation/app-shell/i18n/useI18n'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types'
import { useProjectActions } from '../../../src/presentation/app-shell/useProjectActions'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('project action notifications', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('keeps a cancelled project picker silent and reopens a failed add on a new attempt', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const addProject = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('picker failed'))
      .mockResolvedValueOnce(workbench)
    const notifications = createNotifications()
    const rememberWorkbench = vi.fn<(workbench: WorkbenchSnapshot) => void>()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ addProject })
    })
    const { result } = renderProjectActions({ notifications, rememberWorkbench })

    await act(() => result.current.addProject())
    expect(notifications.notify).not.toHaveBeenCalled()

    await act(() => result.current.addProject())
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: {
          key: 'project:add',
          occurrenceId: expect.any(String)
        },
        kind: 'error',
        message: '无法添加项目。',
        title: '添加项目失败'
      })
    )

    await act(() => result.current.addProject())
    expect(notifications.dismiss).toHaveBeenCalledWith('project:add')
    expect(rememberWorkbench).toHaveBeenCalledWith(workbench)
  })

  it('publishes and precisely clears remove and reorder failures', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const removeProject = vi
      .fn()
      .mockRejectedValueOnce(new Error('remove failed'))
      .mockResolvedValueOnce([])
    const reorderProject = vi
      .fn()
      .mockRejectedValueOnce(new Error('reorder failed'))
      .mockResolvedValueOnce([workbench])
    const notifications = createNotifications()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ removeProject, reorderProject })
    })
    const { result } = renderProjectActions({ notifications })

    await act(() => result.current.removeProject(workbench))
    await act(() => result.current.reorderProject(workbench, null))

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ key: 'project:project-alpha-project:remove' }),
        message: '无法移除项目。',
        title: '移除项目失败'
      })
    )
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ key: 'project:project-alpha-project:reorder' }),
        message: '项目排序失败，请重试。',
        title: '项目排序失败'
      })
    )

    await act(() => result.current.removeProject(workbench))
    await act(() => result.current.reorderProject(workbench, null))

    expect(notifications.dismiss).toHaveBeenCalledWith('project:project-alpha-project:remove')
    expect(notifications.dismiss).toHaveBeenCalledWith('project:project-alpha-project:reorder')
  })

  it('does not let an older successful attempt dismiss a newer failure', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const firstAttempt = createDeferred<WorkbenchSnapshot | null>()
    const secondAttempt = createDeferred<WorkbenchSnapshot | null>()
    const addProject = vi
      .fn()
      .mockImplementationOnce(() => firstAttempt.promise)
      .mockImplementationOnce(() => secondAttempt.promise)
    const notifications = createNotifications()
    const rememberWorkbench = vi.fn<(workbench: WorkbenchSnapshot) => void>()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ addProject })
    })
    const { result } = renderProjectActions({ notifications, rememberWorkbench })
    let firstRun!: Promise<void>
    let secondRun!: Promise<void>

    act(() => {
      firstRun = result.current.addProject()
      secondRun = result.current.addProject()
    })
    await act(async () => {
      secondAttempt.reject(new Error('newer attempt failed'))
      await secondRun
    })

    expect(notifications.notify).toHaveBeenCalledOnce()

    await act(async () => {
      firstAttempt.resolve(workbench)
      await firstRun
    })

    expect(notifications.dismiss).not.toHaveBeenCalledWith('project:add')
    expect(rememberWorkbench).not.toHaveBeenCalled()
  })

  it('retranslates a retained project error and forgets it when the card no longer exists', async () => {
    const addProject = vi
      .fn()
      .mockRejectedValueOnce(createExpectedAppError('PROJECT_NOT_FOUND', 'project missing'))
      .mockResolvedValue(null)
    const notifications = createNotifications()
    notifications.update.mockReturnValueOnce(true).mockReturnValueOnce(false)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ addProject })
    })
    const { result } = renderProjectActions({ notifications })

    await act(() => result.current.addProject())
    const occurrenceId = notifications.notify.mock.calls[0]?.[0].identity?.occurrenceId

    act(() => result.current.selectLocale('en'))

    expect(notifications.update).toHaveBeenLastCalledWith('project:add', {
      identity: { key: 'project:add', occurrenceId },
      kind: 'error',
      message: 'The project does not exist. Add it again.',
      title: 'Could not add project'
    })

    act(() => result.current.selectLocale('zh-CN'))
    notifications.dismiss.mockClear()
    await act(() => result.current.addProject())

    expect(notifications.dismiss).not.toHaveBeenCalledWith('project:add')
  })
})

function renderProjectActions({
  notifications,
  rememberWorkbench = vi.fn<(workbench: WorkbenchSnapshot) => void>()
}: {
  readonly notifications: ReturnType<typeof createNotifications>
  readonly rememberWorkbench?: (workbench: WorkbenchSnapshot) => void
}) {
  return renderHook(
    () => {
      const actions = useProjectActions({
        notifications,
        rememberWorkbench,
        setCurrentWorkbench: vi.fn(),
        setHoveredTerminalBlockId: vi.fn(),
        setSelectedTerminalBlockIds: vi.fn(),
        setSelectedTerminalGroupId: vi.fn(),
        setWorkbenches: vi.fn(),
        terminateWorkbenchTerminalSessions: vi.fn(async () => undefined)
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

function createNotifications() {
  const notify = vi.fn((notification: AppNotificationInput & { identity?: { key: string } }) =>
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
