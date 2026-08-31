import { act, renderHook, waitFor } from '@testing-library/react'

import type { WorkflowRunSnapshot } from '../../../src/contexts/run/application/dto/WorkflowRunSnapshot'
import type { TerminalWorkflowEvent } from '../../../src/contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import { createClientAppError } from '../../../src/shared-kernel/application/errors/AppError'
import type {
  AppNotificationController,
  AppNotificationInput
} from '../../../src/presentation/shared/notifications/appNotifications'
import { useTerminalWorkflow } from '../../../src/presentation/app-shell/useTerminalWorkflow'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('terminal workflow notification publishing', () => {
  const originalRuntime = window.cleancode

  afterEach(() => {
    window.cleancode = originalRuntime
  })

  it('creates one activity notification and updates it through the run lifecycle', async () => {
    let publishEvent: ((event: TerminalWorkflowEvent) => void) | undefined
    const focusWorkbenchNode = vi.fn()
    const notifications = createNotificationController()
    const workbench = withWorkflowTerminal(createWorkbenchSnapshot('/project', 'Project'))
    window.cleancode = createWorkflowRuntime({
      onEvent: (listener) => {
        publishEvent = listener
      }
    })

    renderHook(() =>
      useTerminalWorkflow({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces[0],
        focusWorkbenchNode,
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
    const runningNotification = notifications.notify.mock.calls[0]?.[0]
    runningNotification?.activation?.onClick()
    expect(focusWorkbenchNode).toHaveBeenCalledWith('dev')

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

  it('does not update an active notification when only the canvas viewport changes', async () => {
    let publishEvent: ((event: TerminalWorkflowEvent) => void) | undefined
    const notifications = createNotificationController()
    const workbench = withWorkflowTerminal(createWorkbenchSnapshot('/project', 'Project'))
    window.cleancode = createWorkflowRuntime({
      onEvent: (listener) => {
        publishEvent = listener
      }
    })
    const setCurrentGraph = vi.fn()
    const initialFocusWorkflowNode = vi.fn()
    const latestFocusWorkflowNode = vi.fn()
    const { rerender } = renderHook(
      ({ currentWorkbench, focusWorkbenchNode }) =>
        useTerminalWorkflow({
          currentWorkbench,
          currentWorkspace: currentWorkbench.project.workspaces[0],
          focusWorkbenchNode,
          notifications,
          setCurrentGraph
        }),
      {
        initialProps: {
          currentWorkbench: workbench,
          focusWorkbenchNode: initialFocusWorkflowNode
        }
      }
    )

    await waitFor(() => expect(publishEvent).toBeTypeOf('function'))
    act(() => publishEvent?.({ type: 'run-updated', run: workflowRun('run-1', 'ready') }))
    await waitFor(() => expect(notifications.notify).toHaveBeenCalledOnce())

    rerender({
      currentWorkbench: {
        ...workbench,
        graph: {
          ...workbench.graph,
          viewport: { x: 240, y: -120, zoom: 0.8 }
        }
      },
      focusWorkbenchNode: latestFocusWorkflowNode
    })

    expect(notifications.update).not.toHaveBeenCalled()
    notifications.notify.mock.calls[0]?.[0].activation?.onClick()
    expect(initialFocusWorkflowNode).not.toHaveBeenCalled()
    expect(latestFocusWorkflowNode).toHaveBeenCalledWith('dev')
  })

  it('does not navigate an old notification to a same-id node in another project', async () => {
    let publishEvent: ((event: TerminalWorkflowEvent) => void) | undefined
    const notifications = createNotificationController()
    const focusWorkbenchNode = vi.fn()
    const firstWorkbench = withWorkflowTerminal(createWorkbenchSnapshot('/first', 'Project'))
    const secondWorkbench = withWorkflowTerminal(createWorkbenchSnapshot('/second', 'Other'))
    window.cleancode = createWorkflowRuntime({
      onEvent: (listener) => {
        publishEvent = listener
      }
    })

    const { rerender } = renderHook(
      ({ workbench }) =>
        useTerminalWorkflow({
          currentWorkbench: workbench,
          currentWorkspace: workbench.project.workspaces[0],
          focusWorkbenchNode,
          notifications,
          setCurrentGraph: vi.fn()
        }),
      { initialProps: { workbench: firstWorkbench } }
    )

    await waitFor(() => expect(publishEvent).toBeTypeOf('function'))
    act(() => publishEvent?.({ type: 'run-updated', run: workflowRun('run-1', 'running') }))
    await waitFor(() => expect(notifications.notify).toHaveBeenCalledOnce())
    const oldNotification = notifications.notify.mock.calls[0]?.[0]

    rerender({ workbench: secondWorkbench })
    await waitFor(() => expect(notifications.dismiss).toHaveBeenCalledWith('notification-1'))
    act(() => oldNotification?.activation?.onClick())

    expect(focusWorkbenchNode).not.toHaveBeenCalled()
    expect(notifications.notify).toHaveBeenCalledTimes(1)
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
        focusWorkbenchNode: vi.fn(),
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

  it('does not republish the same terminal outcome after switching away and back', async () => {
    const notifications = createNotificationController()
    const mainWorkbench = createWorkbenchSnapshot('/project', 'Project')
    const featureWorkbench = createWorkbenchSnapshot('/project', 'Project', {
      workspaceDirectory: '/project-feature',
      workspaceId: 'feature'
    })
    const get = vi.fn(async (command: { readonly workspaceId: string }) =>
      command.workspaceId === 'main' ? [failedRun('run-1', 1)] : []
    )
    window.cleancode = createWorkflowRuntime({ get })

    const { rerender } = renderHook(
      ({ workbench }) =>
        useTerminalWorkflow({
          currentWorkbench: workbench,
          currentWorkspace: workbench.project.workspaces[0],
          focusWorkbenchNode: vi.fn(),
          notifications,
          setCurrentGraph: vi.fn()
        }),
      { initialProps: { workbench: mainWorkbench } }
    )

    await waitFor(() => expect(notifications.notify).toHaveBeenCalledTimes(1))

    rerender({ workbench: featureWorkbench })
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith({
        projectDirectory: '/project',
        workspaceId: 'feature'
      })
    )

    rerender({ workbench: mainWorkbench })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3))

    expect(notifications.notify).toHaveBeenCalledTimes(1)
  })

  it('restores the activity notification when returning to an active workflow', async () => {
    const notifications = createNotificationController({ updateResult: false })
    const mainWorkbench = createWorkbenchSnapshot('/project', 'Project')
    const featureWorkbench = createWorkbenchSnapshot('/project', 'Project', {
      workspaceDirectory: '/project-feature',
      workspaceId: 'feature'
    })
    const get = vi.fn(async (command: { readonly workspaceId: string }) =>
      command.workspaceId === 'main' ? [workflowRun('run-1', 'running')] : []
    )
    window.cleancode = createWorkflowRuntime({ get })

    const { rerender } = renderHook(
      ({ workbench }) =>
        useTerminalWorkflow({
          currentWorkbench: workbench,
          currentWorkspace: workbench.project.workspaces[0],
          focusWorkbenchNode: vi.fn(),
          notifications,
          setCurrentGraph: vi.fn()
        }),
      { initialProps: { workbench: mainWorkbench } }
    )

    await waitFor(() => expect(notifications.notify).toHaveBeenCalledTimes(1))
    rerender({ workbench: featureWorkbench })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    rerender({ workbench: mainWorkbench })

    await waitFor(() => expect(notifications.notify).toHaveBeenCalledTimes(2))
    expect(notifications.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ isActivity: true, title: '流程运行中' })
    )
  })

  it('reloads workflow state when switching between projects with the same workspace name', async () => {
    let publishEvent: ((event: TerminalWorkflowEvent) => void) | undefined
    const notifications = createNotificationController()
    const firstWorkbench = createWorkbenchSnapshot('/first-project', 'First')
    const secondWorkbench = createWorkbenchSnapshot('/second-project', 'Second')
    const get = vi.fn(async () => [])
    window.cleancode = createWorkflowRuntime({
      get,
      onEvent: (listener) => {
        publishEvent = listener
      }
    })

    const { rerender } = renderHook(
      ({ workbench }) =>
        useTerminalWorkflow({
          currentWorkbench: workbench,
          currentWorkspace: workbench.project.workspaces[0],
          focusWorkbenchNode: vi.fn(),
          notifications,
          setCurrentGraph: vi.fn()
        }),
      { initialProps: { workbench: firstWorkbench } }
    )

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith({
        projectDirectory: '/first-project',
        workspaceId: 'main'
      })
    )

    rerender({ workbench: secondWorkbench })

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith({
        projectDirectory: '/second-project',
        workspaceId: 'main'
      })
    )

    act(() =>
      publishEvent?.({
        type: 'run-updated',
        run: { ...failedRun('first-run', 1), graphId: 'graph-First' }
      })
    )
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it('does not reopen a manually dismissed activity for ordinary status updates', async () => {
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
        focusWorkbenchNode: vi.fn(),
        notifications,
        setCurrentGraph: vi.fn()
      })
    )

    await waitFor(() => expect(publishEvent).toBeTypeOf('function'))
    act(() => publishEvent?.({ type: 'run-updated', run: workflowRun('run-1', 'running') }))
    await waitFor(() => expect(notifications.notify).toHaveBeenCalledTimes(1))

    act(() => publishEvent?.({ type: 'run-updated', run: workflowRun('run-1', 'ready') }))
    await waitFor(() => expect(notifications.update).toHaveBeenCalledOnce())

    expect(notifications.notify).toHaveBeenCalledTimes(1)
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
        focusWorkbenchNode: vi.fn(),
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

  it('starts a placed template through the existing workflow executor with its exact block set', async () => {
    const start = vi.fn(async () => null)
    const workbench = createWorkbenchSnapshot('/project', 'Project')
    window.cleancode = createWorkflowRuntime({ start })
    const { result } = renderHook(() =>
      useTerminalWorkflow({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces[0],
        focusWorkbenchNode: vi.fn(),
        notifications: createNotificationController(),
        setCurrentGraph: vi.fn()
      })
    )

    await act(() =>
      result.current.startScope({
        type: 'block-set',
        blockIds: ['new-terminal-a', 'new-terminal-b']
      })
    )

    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          type: 'block-set',
          blockIds: ['new-terminal-a', 'new-terminal-b']
        }
      })
    )
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
        focusWorkbenchNode: vi.fn(),
        notifications: createNotificationController(),
        setCurrentGraph: vi.fn()
      })
    )

    let firstStop: Promise<void> | undefined
    act(() => {
      firstStop = result.current.stop('run-1')
      void result.current.stop('run-1')
    })

    expect(stop).toHaveBeenCalledOnce()
    expect(result.current.stoppingRunIds).toEqual(['run-1'])

    finishStop?.(workflowRun('run-1', 'stopped'))
    await act(async () => firstStop)

    expect(result.current.stoppingRunIds).toEqual([])
  })

  it('stops the workflow in the latest project and workspace scope', async () => {
    const stop = vi.fn(async () => null)
    const firstWorkbench = createWorkbenchSnapshot('/first-project', 'First')
    const latestWorkbench = createWorkbenchSnapshot('/latest-project', 'Latest', {
      workspaceDirectory: '/latest-project-feature',
      workspaceId: 'feature'
    })
    const notifications = createNotificationController()
    const setCurrentGraph = vi.fn()
    window.cleancode = createWorkflowRuntime({ stop })
    const { result, rerender } = renderHook(
      ({ currentWorkbench }) =>
        useTerminalWorkflow({
          currentWorkbench,
          currentWorkspace: currentWorkbench.project.workspaces[0],
          focusWorkbenchNode: vi.fn(),
          notifications,
          setCurrentGraph
        }),
      { initialProps: { currentWorkbench: firstWorkbench } }
    )

    rerender({ currentWorkbench: latestWorkbench })
    await act(() => result.current.stop('run-1'))

    expect(stop).toHaveBeenCalledWith({
      projectDirectory: '/latest-project',
      workspaceId: 'feature',
      runId: 'run-1'
    })
  })
})

interface CreateWorkflowRuntimeOptions {
  readonly get?: ReturnType<typeof vi.fn>
  readonly onEvent?: (listener: (event: TerminalWorkflowEvent) => void) => void
  readonly start?: ReturnType<typeof vi.fn>
  readonly stop?: ReturnType<typeof vi.fn>
}

function withWorkflowTerminal(workbench: ReturnType<typeof createWorkbenchSnapshot>) {
  return {
    ...workbench,
    graph: {
      ...workbench.graph,
      blocks: [
        {
          id: 'dev',
          type: 'terminal' as const,
          name: '开发环境',
          description: '',
          launchCommand: 'pnpm dev',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 240 }
        }
      ]
    }
  }
}

function createWorkflowRuntime(
  options: CreateWorkflowRuntimeOptions
): NonNullable<Window['cleancode']> {
  return {
    appName: 'cleancode',
    getTerminalWorkflows: options.get ?? vi.fn(async () => []),
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
    projectId: 'project-Project',
    projectDirectory: '/tmp/Project',
    workspaceId: 'main',
    workspaceDirectory: '/tmp/Project',
    gitBranch: null,
    status,
    nodes: [
      {
        blockId: 'dev',
        dependencyBlockIds: [],
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        endpoint: null,
        error: null,
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
    projectId: 'project-Project',
    projectDirectory: '/tmp/Project',
    workspaceId: 'main',
    workspaceDirectory: '/tmp/Project',
    gitBranch: null,
    status: 'failed',
    nodes: [
      {
        blockId: 'dev',
        dependencyBlockIds: [],
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        endpoint: null,
        error: {
          code: 'COMMAND_FAILED',
          message: `Command exited with code ${exitCode}.`
        },
        exitCode,
        failureReason: `Command exited with code ${exitCode}.`,
        launchCommand: 'pnpm dev',
        name: '开发环境',
        status: 'failed'
      }
    ]
  }
}
