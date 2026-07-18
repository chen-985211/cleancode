import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type { AppNotificationInput } from './appNotifications'

export function createWorkflowFailureNotification(run: WorkflowRunSnapshot): AppNotificationInput {
  const failedNodes = run.nodes.filter((node) => node.status === 'failed')

  if (failedNodes.length === 1) {
    const failedNode = failedNodes[0]
    const exitCodeCopy =
      failedNode.exitCode === null
        ? '请查看该终端输出。'
        : `退出码 ${failedNode.exitCode}。请查看终端输出。`

    return {
      kind: 'error',
      title: '流程失败',
      message: `终端“${failedNode.name}”运行失败，${exitCodeCopy}`
    }
  }

  return {
    kind: 'error',
    title: '流程失败',
    message:
      failedNodes.length > 1
        ? `${failedNodes.length} 个终端运行失败，请查看失败节点的终端输出。`
        : '流程未能完成，请查看失败节点的终端输出。'
  }
}

interface CreateWorkflowRunNotificationOptions {
  readonly isStopping: boolean
  readonly onStop: () => Promise<void> | void
}

export function createWorkflowRunNotification(
  run: WorkflowRunSnapshot,
  { isStopping, onStop }: CreateWorkflowRunNotificationOptions
): AppNotificationInput {
  if (run.status === 'failed') {
    return createWorkflowFailureNotification(run)
  }

  const scopeMessage = createWorkflowRunScopeMessage(run)

  if (run.status === 'succeeded') {
    return {
      autoDismissMs: 4_000,
      kind: 'success',
      message: scopeMessage,
      title: '流程运行成功'
    }
  }

  if (run.status === 'stopped') {
    return {
      autoDismissMs: 4_000,
      kind: 'warning',
      message: scopeMessage,
      title: '流程已停止'
    }
  }

  return {
    action: {
      disabled: isStopping,
      label: '停止本次运行',
      onClick: onStop,
      pendingLabel: '正在停止…',
      tone: 'danger'
    },
    isActivity: true,
    kind: 'info',
    message: scopeMessage,
    title: run.status === 'ready' ? '流程服务已就绪' : '流程运行中'
  }
}

export function getWorkflowRunRootBlockIds(run: WorkflowRunSnapshot): string[] {
  const runBlockIds = new Set(run.nodes.map((node) => node.blockId))

  return run.nodes
    .filter(
      (node) =>
        node.dependencyBlockIds.filter((dependencyId) => runBlockIds.has(dependencyId)).length === 0
    )
    .map((node) => node.blockId)
}

function createWorkflowRunScopeMessage(run: WorkflowRunSnapshot): string {
  const rootIds = getWorkflowRunRootBlockIds(run)
  const rootNames = rootIds
    .map((rootId) => run.nodes.find((node) => node.blockId === rootId)?.name)
    .filter((name): name is string => Boolean(name))

  if (rootNames.length === 1) {
    return `从“${rootNames[0]}”开始 · 涉及 ${run.nodes.length} 个终端`
  }

  if (rootNames.length > 1) {
    return `${rootNames.length} 个起点 · 涉及 ${run.nodes.length} 个终端`
  }

  return run.nodes.length > 0 ? `涉及 ${run.nodes.length} 个终端` : '本次运行未包含终端'
}
