import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { AppNotificationController } from '../../../src/presentation/app-shell/appNotifications'
import { I18nProvider } from '../../../src/presentation/app-shell/i18n/I18nProvider'
import { useWorkspaceExternalOpen } from '../../../src/presentation/app-shell/useWorkspaceExternalOpen'
import { createExpectedAppError } from '../../../src/shared-kernel/application/errors/AppError'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

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

  it('publishes a localized error when the selected target becomes unavailable', async () => {
    const workbench = createWorkbenchSnapshot('/work/app', 'app')
    const notifications = createNotifications()
    installRuntime({
      openWorkspaceExternally: vi.fn(async () => {
        throw createExpectedAppError(
          'WORKSPACE_OPEN_TARGET_UNAVAILABLE',
          'protocol registration disappeared'
        )
      })
    })
    const { result } = renderWorkspaceExternalOpen(workbench, notifications)

    await act(() => result.current.openWorkspace('vscode'))

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: 'VS Code 当前不可用，请改用打开所在文件夹。',
        title: '无法打开工作区'
      })
    )
  })
})

function renderWorkspaceExternalOpen(
  workbench: ReturnType<typeof createWorkbenchSnapshot>,
  notifications = createNotifications()
) {
  return renderHook(
    () =>
      useWorkspaceExternalOpen({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces[0],
        notifications
      }),
    {
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

function createNotifications(): AppNotificationController {
  return {
    dismiss: vi.fn(),
    notify: vi.fn(() => 'notification-1'),
    update: vi.fn(() => false)
  }
}
