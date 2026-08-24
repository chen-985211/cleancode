import type { WorkflowRunSnapshot } from '../../../src/contexts/run/application/dto/WorkflowRunSnapshot'
import {
  createWorkflowFailureNotification,
  createWorkflowRunNotification,
  getWorkflowRunRootBlockIds
} from '../../../src/presentation/app-shell/terminalWorkflowNotifications'

describe('terminal workflow notifications', () => {
  it('describes one failed terminal with its exit code', () => {
    expect(
      createWorkflowFailureNotification(
        workflowRun('run-1', [failedNode('dev', 'OpenCove 开发环境', 1)])
      )
    ).toEqual({
      kind: 'error',
      title: '流程失败',
      message: '终端“OpenCove 开发环境”运行失败，退出码 1。请查看终端输出。'
    })
  })

  it('uses stable fallback copy when no exit code is available', () => {
    expect(
      createWorkflowFailureNotification(
        workflowRun('run-1', [failedNode('dev', 'OpenCove 开发环境', null)])
      )
    ).toMatchObject({
      message: '终端“OpenCove 开发环境”运行失败，请查看该终端输出。'
    })
  })

  it('summarizes multiple failed terminals without exposing raw failure messages', () => {
    expect(
      createWorkflowFailureNotification(
        workflowRun('run-1', [
          failedNode('install', '依赖就绪', 1),
          failedNode('dev', 'OpenCove 开发环境', null)
        ])
      )
    ).toMatchObject({
      message: '2 个终端运行失败，请查看失败节点的终端输出。'
    })
  })

  it('describes an active run with its root and exact terminal count', () => {
    const onStop = vi.fn()
    const onNavigateToTarget = vi.fn()
    const run = workflowRun(
      'run-1',
      [
        workflowNode('install', '依赖就绪', [], 'succeeded'),
        workflowNode('dev', 'OpenCove 开发环境', ['install'], 'running')
      ],
      'running'
    )

    expect(getWorkflowRunRootBlockIds(run)).toEqual(['install'])
    const notification = createWorkflowRunNotification(run, {
      isStopping: false,
      onNavigateToTarget,
      onStop
    })

    expect(notification).toEqual({
      accessibleLabel: '流程运行中 — 从“依赖就绪”开始 · 涉及 2 个终端',
      action: {
        disabled: false,
        icon: 'stop',
        label: '停止本次运行',
        onClick: onStop,
        pendingLabel: '正在停止…',
        tone: 'danger'
      },
      activation: {
        label: '定位到流程节点“OpenCove 开发环境”',
        onClick: expect.any(Function)
      },
      isActivity: true,
      kind: 'info',
      source: { label: '从“依赖就绪”开始 · 涉及 2 个终端' },
      title: '流程运行中'
    })
    notification.activation?.onClick()
    expect(onNavigateToTarget).toHaveBeenCalledWith({
      objectId: 'dev',
      objectKind: 'terminal',
      projectId: 'project-1',
      workspaceId: 'main'
    })
  })

  it('includes the failure detail in the accessible notification label', () => {
    const notification = createWorkflowRunNotification(
      workflowRun('run-1', [failedNode('dev', 'OpenCove 开发环境', 1)]),
      {
        isStopping: false,
        onNavigateToTarget: vi.fn(),
        onStop: vi.fn()
      }
    )

    expect(notification.accessibleLabel).toBe(
      '流程失败 — 终端“OpenCove 开发环境”运行失败，退出码 1。请查看终端输出。'
    )
  })

  it.each([
    {
      expectedBlockId: 'failed',
      name: 'failed node',
      nodes: [
        workflowNode('root', 'Root', [], 'succeeded'),
        workflowNode('running', 'Running', ['root'], 'running'),
        workflowNode('failed', 'Failed', ['root'], 'failed')
      ],
      status: 'failed' as const
    },
    {
      expectedBlockId: 'running',
      name: 'running node',
      nodes: [
        workflowNode('root', 'Root', [], 'succeeded'),
        workflowNode('ready', 'Ready', ['root'], 'ready'),
        workflowNode('running', 'Running', ['root'], 'running')
      ],
      status: 'running' as const
    },
    {
      expectedBlockId: 'ready',
      name: 'ready service',
      nodes: [
        workflowNode('root', 'Root', [], 'succeeded'),
        workflowNode('ready', 'Ready', ['root'], 'ready')
      ],
      status: 'ready' as const
    },
    {
      expectedBlockId: 'root',
      name: 'workflow root fallback',
      nodes: [
        workflowNode('child', 'Child', ['root'], 'succeeded'),
        workflowNode('root', 'Root', [], 'succeeded')
      ],
      status: 'succeeded' as const
    }
  ])('navigates to the $name', ({ expectedBlockId, nodes, status }) => {
    const onNavigateToTarget = vi.fn()
    const notification = createWorkflowRunNotification(workflowRun('run-1', nodes, status), {
      isStopping: false,
      onNavigateToTarget,
      onStop: vi.fn()
    })

    notification.activation?.onClick()

    expect(onNavigateToTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: expectedBlockId,
        objectKind: 'terminal',
        projectId: 'project-1',
        workspaceId: 'main'
      })
    )
  })

  it('does not expose an activation when the workflow has no target node', () => {
    const notification = createWorkflowRunNotification(workflowRun('run-1', [], 'succeeded'), {
      isStopping: false,
      onNavigateToTarget: vi.fn(),
      onStop: vi.fn()
    })

    expect(notification.activation).toBeUndefined()
  })

  it('turns terminal workflow outcomes into stable notification states', () => {
    const nodes = [workflowNode('install', '依赖就绪', [], 'succeeded')]

    expect(
      createWorkflowRunNotification(workflowRun('ready', nodes, 'ready'), {
        isStopping: false,
        onNavigateToTarget: vi.fn(),
        onStop: vi.fn()
      })
    ).toMatchObject({
      isActivity: true,
      kind: 'info',
      source: { label: '从“依赖就绪”开始 · 涉及 1 个终端' },
      title: '流程服务已就绪'
    })
    expect(
      createWorkflowRunNotification(workflowRun('succeeded', nodes, 'succeeded'), {
        isStopping: false,
        onNavigateToTarget: vi.fn(),
        onStop: vi.fn()
      })
    ).toMatchObject({
      autoDismissMs: 4_000,
      kind: 'success',
      source: { label: '从“依赖就绪”开始 · 涉及 1 个终端' },
      title: '流程运行成功'
    })
    expect(
      createWorkflowRunNotification(workflowRun('stopped', nodes, 'stopped'), {
        isStopping: false,
        onNavigateToTarget: vi.fn(),
        onStop: vi.fn()
      })
    ).toMatchObject({
      autoDismissMs: 4_000,
      kind: 'warning',
      source: { label: '从“依赖就绪”开始 · 涉及 1 个终端' },
      title: '流程已停止'
    })
  })
})

function workflowRun(
  id: string,
  nodes: WorkflowRunSnapshot['nodes'],
  status: WorkflowRunSnapshot['status'] = 'failed'
): WorkflowRunSnapshot {
  return {
    id,
    graphId: 'graph-1',
    projectId: 'project-1',
    projectDirectory: '/project',
    workspaceId: 'main',
    workspaceDirectory: '/project',
    gitBranch: null,
    status,
    nodes
  }
}

function workflowNode(
  blockId: string,
  name: string,
  dependencyBlockIds: readonly string[],
  status: WorkflowRunSnapshot['nodes'][number]['status']
): WorkflowRunSnapshot['nodes'][number] {
  return {
    blockId,
    dependencyBlockIds,
    executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
    endpoint: null,
    error: null,
    exitCode: status === 'succeeded' ? 0 : null,
    failureReason: null,
    launchCommand: 'echo ready',
    name,
    status
  }
}

function failedNode(
  blockId: string,
  name: string,
  exitCode: number | null
): WorkflowRunSnapshot['nodes'][number] {
  return {
    blockId,
    dependencyBlockIds: [],
    executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
    endpoint: null,
    error: { code: 'COMMAND_FAILED', message: 'raw infrastructure failure' },
    exitCode,
    failureReason: 'raw infrastructure failure',
    launchCommand: 'false',
    name,
    status: 'failed'
  }
}
