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

describe('terminal workflow concurrent presentation', () => {
  const originalRuntime = window.cleancode

  afterEach(() => {
    window.cleancode = originalRuntime
  })

  it('projects every workspace run without requiring a terminal combination', async () => {
    const frontend = workflowRun('frontend-run', 'frontend', 'running')
    const backend = workflowRun('backend-run', 'backend', 'ready')
    const workbench = withTerminals(['frontend', 'backend'])
    window.cleancode = createRuntime({ getRuns: vi.fn(async () => [frontend, backend]) })

    const { result } = renderHook(() =>
      useTerminalWorkflow({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces[0],
        focusWorkbenchNode: vi.fn(),
        notifications: createNotifications(),
        setCurrentGraph: vi.fn()
      })
    )

    await waitFor(() =>
      expect(concurrentProjection(result.current).runs.map((run) => run.id)).toEqual([
        frontend.id,
        backend.id
      ])
    )
    expect(result.current.nodeStatuses).toEqual({ frontend: 'running', backend: 'ready' })
    expect(concurrentProjection(result.current).activeRunIdByRootBlockId).toEqual({
      frontend: frontend.id,
      backend: backend.id
    })
  })

  it('publishes and stops concurrent workflow notifications by run identity', async () => {
    let publishEvent: ((event: TerminalWorkflowEvent) => void) | undefined
    const stop = vi.fn(async () => null)
    const notifications = createNotifications()
    const workbench = withTerminals(['frontend', 'backend'])
    window.cleancode = createRuntime({
      getRuns: vi.fn(async () => []),
      onEvent: (listener) => {
        publishEvent = listener
      },
      stop
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

    act(() => {
      publishEvent?.({
        type: 'run-updated',
        run: workflowRun('frontend-run', 'frontend', 'running')
      })
      publishEvent?.({
        type: 'run-updated',
        run: workflowRun('backend-run', 'backend', 'running')
      })
    })
    await waitFor(() => expect(notifications.notify).toHaveBeenCalledTimes(2))

    await act(async () => notifications.notify.mock.calls[0]?.[0].action?.onClick())
    await act(async () => notifications.notify.mock.calls[1]?.[0].action?.onClick())

    expect(stop.mock.calls).toEqual([
      [{ projectDirectory: '/project', workspaceId: 'main', runId: 'frontend-run' }],
      [{ projectDirectory: '/project', workspaceId: 'main', runId: 'backend-run' }]
    ])
  })

  it('explains that overlapping workflow terminals are already running', async () => {
    const notifications = createNotifications()
    const workbench = withTerminals(['frontend'])
    window.cleancode = createRuntime({
      getRuns: vi.fn(async () => []),
      start: vi.fn(async () => {
        throw createClientAppError({
          code: 'TERMINAL_WORKFLOW_SCOPE_CONFLICT',
          isExpected: true,
          message: 'Terminal workflow overlaps an active run.'
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

    await act(() => result.current.start('frontend'))

    expect(notifications.notify).toHaveBeenCalledWith({
      kind: 'error',
      title: '流程操作失败',
      message: '部分终端已属于正在运行的流程，请先停止该流程。'
    })
  })

  it('keeps live run events that arrive while the workspace query is pending', async () => {
    let publishEvent: ((event: TerminalWorkflowEvent) => void) | undefined
    let resolveRuns: ((runs: readonly WorkflowRunSnapshot[]) => void) | undefined
    const getRuns = vi.fn(
      () =>
        new Promise<readonly WorkflowRunSnapshot[]>((resolve) => {
          resolveRuns = resolve
        })
    )
    const workbench = withTerminals(['frontend', 'backend'])
    window.cleancode = createRuntime({
      getRuns,
      onEvent: (listener) => {
        publishEvent = listener
      }
    })
    const { result } = renderHook(() =>
      useTerminalWorkflow({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces[0],
        focusWorkbenchNode: vi.fn(),
        notifications: createNotifications(),
        setCurrentGraph: vi.fn()
      })
    )
    await waitFor(() => expect(publishEvent).toBeTypeOf('function'))

    act(() =>
      publishEvent?.({
        type: 'run-updated',
        run: workflowRun('frontend-run', 'frontend', 'running')
      })
    )
    resolveRuns?.([workflowRun('backend-run', 'backend', 'running')])

    await waitFor(() =>
      expect(
        concurrentProjection(result.current)
          .runs.map((run) => run.id)
          .sort()
      ).toEqual(['backend-run', 'frontend-run'])
    )
  })
})

interface ConcurrentProjection {
  readonly activeRunIdByRootBlockId: Readonly<Record<string, string>>
  readonly runs: readonly WorkflowRunSnapshot[]
}

function concurrentProjection(value: unknown): ConcurrentProjection {
  return value as ConcurrentProjection
}

function createRuntime(input: {
  readonly getRuns: ReturnType<typeof vi.fn>
  readonly onEvent?: (listener: (event: TerminalWorkflowEvent) => void) => void
  readonly start?: ReturnType<typeof vi.fn>
  readonly stop?: ReturnType<typeof vi.fn>
}): NonNullable<Window['cleancode']> {
  return {
    appName: 'cleancode',
    getTerminalWorkflows: input.getRuns,
    onTerminalWorkflowEvent: vi.fn((listener) => {
      input.onEvent?.(listener)
      return vi.fn()
    }),
    startTerminalWorkflow: input.start ?? vi.fn(async () => null),
    stopTerminalWorkflow: input.stop ?? vi.fn(async () => null)
  } as unknown as NonNullable<Window['cleancode']>
}

function createNotifications(): AppNotificationController & {
  readonly notify: ReturnType<typeof vi.fn<(notification: AppNotificationInput) => string>>
} {
  let sequence = 0
  return {
    dismiss: vi.fn(),
    notify: vi.fn<(notification: AppNotificationInput) => string>(() => {
      sequence += 1
      return `notification-${sequence}`
    }),
    update: vi.fn(() => true)
  }
}

function withTerminals(blockIds: readonly string[]) {
  const workbench = createWorkbenchSnapshot('/project', 'Project')
  return {
    ...workbench,
    graph: {
      ...workbench.graph,
      blocks: blockIds.map((blockId, index) => ({
        id: blockId,
        type: 'terminal' as const,
        name: blockId,
        description: '',
        launchCommand: `run ${blockId}`,
        position: { x: index * 360, y: 0 },
        size: { width: 320, height: 240 }
      }))
    }
  }
}

function workflowRun(
  id: string,
  blockId: string,
  status: WorkflowRunSnapshot['status']
): WorkflowRunSnapshot {
  return {
    id,
    graphId: 'graph-Project',
    projectId: 'project-Project',
    projectDirectory: '/project',
    workspaceId: 'main',
    workspaceDirectory: '/project',
    gitBranch: null,
    status,
    nodes: [
      {
        blockId,
        dependencyBlockIds: [],
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        endpoint: null,
        error: null,
        exitCode: null,
        failureReason: null,
        launchCommand: `run ${blockId}`,
        name: blockId,
        status: status === 'ready' ? 'ready' : status
      }
    ]
  }
}
