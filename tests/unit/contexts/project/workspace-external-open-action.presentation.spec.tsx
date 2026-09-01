import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { useWorkspaceExternalOpen } from '../../../../src/contexts/project/presentation/view-models/useWorkspaceExternalOpen'
import type {
  AppNotificationController,
  AppNotificationInput
} from '../../../../src/presentation/shared/notifications/appNotifications'
import { I18nProvider } from '../../../../src/presentation/i18n/I18nProvider'
import { useI18n } from '../../../../src/presentation/i18n/useI18n'
import { createExpectedAppError } from '../../../../src/shared-kernel/application/errors/AppError'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../../fixtures/presentation/appShellFixtures'

describe('workspace external open action', () => {
  it('discovers VS Code and submits workspace identity without a renderer-owned directory', async () => {
    const workbench = createWorkbenchSnapshot('/work/app', 'app', {
      workspaceId: 'feature',
      workspaceDirectory: '/work/app-feature'
    })
    const getWorkspaceExternalOpenCapabilities = vi.fn(async () => ({
      vscode: { available: true }
    }))
    const openWorkspaceExternally = vi.fn(
      async (_command: {
        readonly projectDirectory: string
        readonly target: 'vscode' | 'folder'
        readonly workspaceId: string
      }) => {
        void _command
      }
    )
    installRuntime({ getWorkspaceExternalOpenCapabilities, openWorkspaceExternally })
    const { result } = renderWorkspaceExternalOpen(workbench)

    await waitFor(() => expect(result.current.capabilities.vscode.available).toBe(true))
    await act(() => result.current.openWorkspace('folder'))

    expect(openWorkspaceExternally).toHaveBeenCalledWith({
      projectDirectory: '/work/app',
      target: 'folder',
      workspaceId: 'feature'
    })
    expect(openWorkspaceExternally.mock.calls[0]?.[0]).not.toHaveProperty('directory')
  })

  it('refreshes transient VS Code availability when the window regains focus', async () => {
    const workbench = createWorkbenchSnapshot('/work/app', 'app')
    const refreshedCapabilities = createDeferred<{ vscode: { available: boolean } }>()
    const getWorkspaceExternalOpenCapabilities = vi
      .fn()
      .mockResolvedValueOnce({ vscode: { available: true } })
      .mockImplementationOnce(() => refreshedCapabilities.promise)
    installRuntime({ getWorkspaceExternalOpenCapabilities })
    const { result } = renderWorkspaceExternalOpen(workbench)

    await waitFor(() => expect(result.current.capabilities.vscode.available).toBe(true))

    act(() => window.dispatchEvent(new Event('focus')))
    expect(getWorkspaceExternalOpenCapabilities).toHaveBeenCalledTimes(2)
    expect(result.current.capabilities.vscode.available).toBe(false)

    act(() => refreshedCapabilities.resolve({ vscode: { available: true } }))
    await waitFor(() => expect(result.current.capabilities.vscode.available).toBe(true))
  })

  it('publishes a localized error when the selected target becomes unavailable', async () => {
    const workbench = createWorkbenchSnapshot('/work/app', 'app')
    const notifications = createNotifications()
    installRuntime({
      getWorkspaceExternalOpenCapabilities: vi.fn(async () => ({
        vscode: { available: true }
      })),
      openWorkspaceExternally: vi.fn(async () => {
        throw createExpectedAppError(
          'WORKSPACE_OPEN_TARGET_UNAVAILABLE',
          'protocol registration disappeared'
        )
      })
    })
    const { result } = renderWorkspaceExternalOpen(workbench, notifications)

    await waitFor(() => expect(result.current.capabilities.vscode.available).toBe(true))
    await act(() => result.current.openWorkspace('vscode'))

    expect(result.current.capabilities.vscode.available).toBe(false)
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: 'VS Code 当前不可用，请改用打开所在文件夹。',
        title: '无法打开工作区'
      })
    )
  })

  it('uses the current locale when an in-flight failure settles', async () => {
    const workbench = createWorkbenchSnapshot('/work/app', 'app')
    const notifications = createNotifications()
    const attempt = createDeferred<void>()
    installRuntime({
      openWorkspaceExternally: vi.fn(() => attempt.promise)
    })
    const { result } = renderWorkspaceExternalOpen(workbench, notifications)
    let request: Promise<void> | undefined

    act(() => {
      request = result.current.openWorkspace('folder')
    })
    act(() => result.current.selectLocale('en'))
    await act(async () => {
      attempt.reject(createExpectedAppError('WORKSPACE_EXTERNAL_OPEN_FAILED', 'system open failed'))
      await request
    })

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'The system could not open this workspace.',
        title: 'Could not open workspace'
      })
    )
  })

  it('retains errors from other project and workspace scopes', async () => {
    const workbenchA = createWorkbenchSnapshot('/work/a', 'a')
    const workbenchB = createWorkbenchSnapshot('/work/b', 'b')
    const notifications = createNotifications()
    notifications.notify.mockReturnValueOnce('notification-a').mockReturnValueOnce('notification-b')
    installRuntime({
      openWorkspaceExternally: vi.fn(async () => {
        throw createExpectedAppError('WORKSPACE_EXTERNAL_OPEN_FAILED', 'system open failed')
      })
    })
    const view = renderWorkspaceExternalOpen(workbenchA, notifications)

    await act(() => view.result.current.openWorkspace('folder'))
    view.rerender({ workbench: workbenchB })
    await act(() => view.result.current.openWorkspace('folder'))

    expect(notifications.dismiss).not.toHaveBeenCalledWith('notification-a')
    expect(notifications.notify).toHaveBeenCalledTimes(2)
  })

  it('retains the previous error until its retry succeeds', async () => {
    const workbench = createWorkbenchSnapshot('/work/app', 'app')
    const notifications = createNotifications()
    const retry = createDeferred<void>()
    const openWorkspaceExternally = vi
      .fn()
      .mockRejectedValueOnce(
        createExpectedAppError('WORKSPACE_EXTERNAL_OPEN_FAILED', 'system open failed')
      )
      .mockImplementationOnce(() => retry.promise)
    installRuntime({ openWorkspaceExternally })
    const { result } = renderWorkspaceExternalOpen(workbench, notifications)

    await act(() => result.current.openWorkspace('folder'))
    let retryRequest: Promise<void> | undefined
    act(() => {
      retryRequest = result.current.openWorkspace('folder')
    })

    expect(notifications.dismiss).not.toHaveBeenCalled()

    await act(async () => {
      retry.resolve()
      await retryRequest
    })
    expect(notifications.dismiss).toHaveBeenCalledWith('notification-1')
  })

  it('does not dismiss the previous error when its retry also fails', async () => {
    const workbench = createWorkbenchSnapshot('/work/app', 'app')
    const notifications = createNotifications()
    const openWorkspaceExternally = vi.fn(async () => {
      throw createExpectedAppError('WORKSPACE_EXTERNAL_OPEN_FAILED', 'system open failed')
    })
    installRuntime({ openWorkspaceExternally })
    const { result } = renderWorkspaceExternalOpen(workbench, notifications)

    await act(() => result.current.openWorkspace('folder'))
    await act(() => result.current.openWorkspace('folder'))

    expect(notifications.dismiss).not.toHaveBeenCalled()
    expect(notifications.notify).toHaveBeenCalledTimes(2)
  })
})

function renderWorkspaceExternalOpen(
  workbench: ReturnType<typeof createWorkbenchSnapshot>,
  notifications = createNotifications()
) {
  return renderHook(
    ({ workbench: activeWorkbench }) => {
      const externalOpen = useWorkspaceExternalOpen({
        currentProject: activeWorkbench.project,
        currentWorkspace: activeWorkbench.project.workspaces[0],
        notifications
      })
      const { selectLocale } = useI18n()
      return { ...externalOpen, selectLocale }
    },
    {
      initialProps: { workbench },
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <I18nProvider initialLocale="zh-CN">{children}</I18nProvider>
      )
    }
  )
}

function installRuntime(overrides: Parameters<typeof createRuntimeApi>[0]): void {
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: createRuntimeApi(overrides)
  })
}

function createNotifications(): AppNotificationController & {
  readonly dismiss: ReturnType<typeof vi.fn<(notificationId: string) => void>>
  readonly notify: ReturnType<typeof vi.fn<(notification: AppNotificationInput) => string>>
  readonly update: ReturnType<
    typeof vi.fn<(notificationId: string, notification: AppNotificationInput) => boolean>
  >
} {
  return {
    dismiss: vi.fn<(notificationId: string) => void>(),
    notify: vi.fn<(notification: AppNotificationInput) => string>(() => 'notification-1'),
    update: vi.fn<(notificationId: string, notification: AppNotificationInput) => boolean>(
      () => false
    )
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly reject: (error: unknown) => void
  readonly resolve: (value: T) => void
} {
  let reject!: (error: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise
    resolve = resolvePromise
  })
  return { promise, reject, resolve }
}
