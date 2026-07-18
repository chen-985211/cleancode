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
    const run = workflowRun(
      'run-1',
      [
        workflowNode('install', '依赖就绪', [], 'succeeded'),
        workflowNode('dev', 'OpenCove 开发环境', ['install'], 'running')
      ],
      'running'
    )

    expect(getWorkflowRunRootBlockIds(run)).toEqual(['install'])
    expect(createWorkflowRunNotification(run, { isStopping: false, onStop })).toEqual({
      action: {
        disabled: false,
        label: '停止本次运行',
        onClick: onStop,
        pendingLabel: '正在停止…',
        tone: 'danger'
      },
      isActivity: true,
      kind: 'info',
      message: '从“依赖就绪”开始 · 涉及 2 个终端',
      title: '流程运行中'
    })
  })

  it('turns terminal workflow outcomes into stable notification states', () => {
    const nodes = [workflowNode('install', '依赖就绪', [], 'succeeded')]

    expect(
      createWorkflowRunNotification(workflowRun('ready', nodes, 'ready'), {
        isStopping: false,
        onStop: vi.fn()
      })
    ).toMatchObject({ isActivity: true, kind: 'info', title: '流程服务已就绪' })
    expect(
      createWorkflowRunNotification(workflowRun('succeeded', nodes, 'succeeded'), {
        isStopping: false,
        onStop: vi.fn()
      })
    ).toMatchObject({ autoDismissMs: 4_000, kind: 'success', title: '流程运行成功' })
    expect(
      createWorkflowRunNotification(workflowRun('stopped', nodes, 'stopped'), {
        isStopping: false,
        onStop: vi.fn()
      })
    ).toMatchObject({ autoDismissMs: 4_000, kind: 'warning', title: '流程已停止' })
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
    workspaceName: 'main',
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
    exitCode,
    failureReason: 'raw infrastructure failure',
    launchCommand: 'false',
    name,
    status: 'failed'
  }
}
