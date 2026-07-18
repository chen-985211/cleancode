import { act, renderHook, waitFor } from '@testing-library/react'

import type { WorkflowRunSnapshot } from '../../../src/contexts/run/application/dto/WorkflowRunSnapshot'
import type { TerminalWorkflowEvent } from '../../../src/contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import { createClientAppError } from '../../../src/shared-kernel/application/errors/AppError'
import type {
  AppNotificationController,
  AppNotificationInput
} from '../../../src/presentation/app-shell/appNotifications'
import { useTerminalWorkflow } from '../../../src/presentation/app-shell/useTerminalWorkflow'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('terminal workflow notification publishing', () => {
  const originalRuntime = window.cleancode

  afterEach(() => {
    window.cleancode = originalRuntime
  })

  it('creates one activity notification and updates it through the run lifecycle', async () => {
    let publishEvent: ((event: TerminalWorkflowEvent) => void) | undefined
    const notifications = createNotificationController()
    const workbench = createWorkbenchSnapshot('/project', 'Project')
    window.cleancode = createWorkflowRuntime({
      onEvent: (listener) => {
        publishEvent = listener
      }
    })

    renderHook(() =>
      useTerminalWorkflow({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces[0],
        notifications,
        setCurrentGraph: vi.fn()
      })
    )

    await waitFor(() => expect(publishEvent).toBeTypeOf('function'))

    act(() => publishEvent?.({ type: 'run-updated', run: workflowRun('run-1', 'running') }))
    await waitFor(() => expect(notifications.notify).toHaveBeenCalledTimes(1))
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ isActivity: true, title: '流程运行中' })
    )

    act(() => publishEvent?.({ type: 'run-updated', run: workflowRun('run-1', 'ready') }))
    await waitFor(() =>
      expect(notifications.update).toHaveBeenLastCalledWith(
        'notification-1',
        expect.objectContaining({ title: '流程服务已就绪' })
      )
    )

    act(() => publishEvent?.({ type: 'run-updated', run: failedRun('run-1', 1) }))
    await waitFor(() =>
      expect(notifications.update).toHaveBeenLastCalledWith(
        'notification-1',
        expect.objectContaining({ kind: 'error', title: '流程失败' })
      )
    )

    act(() => publishEvent?.({ type: 'run-updated', run: failedRun('run-1', 1) }))
    await waitFor(() => expect(notifications.update).toHaveBeenCalledTimes(2))
  })

  it('restores a dismissed activity only when the run later fails', async () => {
    let publishEvent: ((event: TerminalWorkflowEvent) => void) | undefined
    const notifications = createNotificationController({ updateResult: false })
    const workbench = createWorkbenchSnapshot('/project', 'Project')
    window.cleancode = createWorkflowRuntime({
      onEvent: (listener) => {
        publishEvent = listener
      }
    })

    renderHook(() =>
      useTerminalWorkflow({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces[0],
        notifications,
        setCurrentGraph: vi.fn()
      })
    )

    await waitFor(() => expect(publishEvent).toBeTypeOf('function'))
    act(() => publishEvent?.({ type: 'run-updated', run: workflowRun('run-1', 'running') }))
    await waitFor(() => expect(notifications.notify).toHaveBeenCalledTimes(1))

    act(() => publishEvent?.({ type: 'run-updated', run: failedRun('run-1', 1) }))

    await waitFor(() => expect(notifications.notify).toHaveBeenCalledTimes(2))
    expect(notifications.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'error', title: '流程失败' })
    )
  })

  it('publishes mapped workflow action errors', async () => {
    const notifications = createNotificationController()
    const workbench = createWorkbenchSnapshot('/project', 'Project')
    window.cleancode = createWorkflowRuntime({
      start: vi.fn(async () => {
        throw createClientAppError({
          code: 'TERMINAL_WORKFLOW_COMMAND_MISSING',
          isExpected: true,
          message: 'Every terminal requires a launch command.'
        })
      })
    })
    const { result } = renderHook(() =>
      useTerminalWorkflow({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces[0],
        notifications,
        setCurrentGraph: vi.fn()
      })
    )

    await act(() => result.current.start('dev'))

    expect(notifications.notify).toHaveBeenCalledWith({
      kind: 'error',
      title: '流程操作失败',
      message: '流程中的每个终端都需要配置启动命令。'
    })
  })

  it('prevents duplicate stop requests while one is pending', async () => {
    let finishStop: ((run: WorkflowRunSnapshot) => void) | undefined
    const stop = vi.fn(
      () =>
        new Promise<WorkflowRunSnapshot>((resolve) => {
          finishStop = resolve
        })
    )
    const workbench = createWorkbenchSnapshot('/project', 'Project')
    window.cleancode = createWorkflowRuntime({ stop })
    const { result } = renderHook(() =>
      useTerminalWorkflow({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces[0],
        notifications: createNotificationController(),
        setCurrentGraph: vi.fn()
      })
    )

    let firstStop: Promise<void> | undefined
    act(() => {
      firstStop = result.current.stop()
      void result.current.stop()
    })

    expect(stop).toHaveBeenCalledOnce()
    expect(result.current.isStopping).toBe(true)

    finishStop?.(workflowRun('run-1', 'stopped'))
    await act(async () => firstStop)

    expect(result.current.isStopping).toBe(false)
  })
})

interface CreateWorkflowRuntimeOptions {
  readonly onEvent?: (listener: (event: TerminalWorkflowEvent) => void) => void
  readonly start?: ReturnType<typeof vi.fn>
  readonly stop?: ReturnType<typeof vi.fn>
}

function createWorkflowRuntime(
  options: CreateWorkflowRuntimeOptions
): NonNullable<Window['cleancode']> {
  return {
    appName: 'cleancode',
    getTerminalWorkflow: vi.fn(async () => null),
    onTerminalWorkflowEvent: vi.fn((listener) => {
      options.onEvent?.(listener)
      return vi.fn()
    }),
    startTerminalWorkflow: options.start ?? vi.fn(async () => null),
    stopTerminalWorkflow: options.stop ?? vi.fn(async () => null)
  } as unknown as NonNullable<Window['cleancode']>
}

function createNotificationController(
  options: { readonly updateResult?: boolean } = {}
): AppNotificationController & {
  readonly dismiss: ReturnType<typeof vi.fn>
  readonly notify: ReturnType<typeof vi.fn<(notification: AppNotificationInput) => string>>
  readonly update: ReturnType<typeof vi.fn>
} {
  return {
    dismiss: vi.fn<(notificationId: string) => void>(),
    notify: vi.fn<(notification: AppNotificationInput) => string>(() => 'notification-1'),
    update: vi.fn<(notificationId: string, notification: AppNotificationInput) => boolean>(
      () => options.updateResult ?? true
    )
  }
}

function workflowRun(id: string, status: WorkflowRunSnapshot['status']): WorkflowRunSnapshot {
  return {
    id,
    graphId: 'graph-Project',
    workspaceName: 'main',
    status,
    nodes: [
      {
        blockId: 'dev',
        dependencyBlockIds: [],
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        exitCode: status === 'succeeded' ? 0 : null,
        failureReason: null,
        launchCommand: 'pnpm dev',
        name: '开发环境',
        status: status === 'ready' ? 'ready' : status
      }
    ]
  }
}

function failedRun(id: string, exitCode: number): WorkflowRunSnapshot {
  return {
    id,
    graphId: 'graph-Project',
    workspaceName: 'main',
    status: 'failed',
    nodes: [
      {
        blockId: 'dev',
        dependencyBlockIds: [],
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        exitCode,
        failureReason: `Command exited with code ${exitCode}.`,
        launchCommand: 'pnpm dev',
        name: '开发环境',
        status: 'failed'
      }
    ]
  }
}
