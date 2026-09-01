import type { WorkflowRunSnapshot } from '../../../../contexts/run/application/dto/WorkflowRunSnapshot'
import {
  createCanvasObjectIdentity,
  type CanvasObjectIdentity
} from '../../../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { AppNotificationInput } from '../../../shared/notifications/appNotifications'
import { translate, type Translate } from '../../../i18n/messages'

export function createWorkflowFailureNotification(
  run: WorkflowRunSnapshot,
  t: Translate = defaultTranslate
): AppNotificationInput {
  const failedNodes = run.nodes.filter((node) => node.status === 'failed')

  if (failedNodes.length === 1) {
    const failedNode = failedNodes[0]
    const exitCodeCopy =
      failedNode.exitCode === null
        ? t('workflow.inspectOutput')
        : t('workflow.exitCodeOutput', { exitCode: failedNode.exitCode })

    return {
      kind: 'error',
      title: t('workflow.failureTitle'),
      message: t('workflow.singleFailure', {
        terminalName: failedNode.name,
        detail: exitCodeCopy
      })
    }
  }

  return {
    kind: 'error',
    title: t('workflow.failureTitle'),
    message:
      failedNodes.length > 1
        ? t('workflow.multipleFailures', { count: failedNodes.length })
        : t('workflow.generalFailure')
  }
}

interface CreateWorkflowRunNotificationOptions {
  readonly isStopping: boolean
  readonly onNavigateToTarget: (target: CanvasObjectIdentity) => Promise<void> | void
  readonly onStop: () => Promise<void> | void
}

export function createWorkflowRunNotification(
  run: WorkflowRunSnapshot,
  { isStopping, onNavigateToTarget, onStop }: CreateWorkflowRunNotificationOptions,
  t: Translate = defaultTranslate
): AppNotificationInput {
  let notification: AppNotificationInput

  if (run.status === 'failed') {
    notification = createWorkflowFailureNotification(run, t)
  } else if (run.status === 'succeeded') {
    notification = {
      autoDismissMs: 4_000,
      kind: 'success',
      source: { label: createWorkflowRunScopeMessage(run, t) },
      title: t('workflow.succeededTitle')
    }
  } else if (run.status === 'stopped') {
    notification = {
      autoDismissMs: 4_000,
      kind: 'warning',
      source: { label: createWorkflowRunScopeMessage(run, t) },
      title: t('workflow.stoppedTitle')
    }
  } else {
    notification = {
      action: {
        disabled: isStopping,
        icon: 'stop',
        label: t('workflow.stopAction'),
        onClick: onStop,
        pendingLabel: t('workflow.stoppingAction'),
        tone: 'danger'
      },
      isActivity: true,
      kind: 'info',
      source: { label: createWorkflowRunScopeMessage(run, t) },
      title: run.status === 'ready' ? t('workflow.readyTitle') : t('workflow.runningTitle')
    }
  }

  const accessibleNotification = {
    ...notification,
    accessibleLabel: [notification.title, notification.message, notification.source?.label]
      .filter((part): part is string => Boolean(part))
      .join(' — ')
  }
  const targetNode = resolveWorkflowRunNotificationTarget(run)
  return targetNode
    ? {
        ...accessibleNotification,
        activation: {
          label: t('workflow.focusNode', { terminalName: targetNode.name }),
          onClick: () =>
            onNavigateToTarget(
              createCanvasObjectIdentity({
                objectId: targetNode.blockId,
                objectKind: 'terminal',
                projectId: run.projectId,
                workspaceId: run.workspaceId
              })
            )
        }
      }
    : accessibleNotification
}

function resolveWorkflowRunNotificationTarget(
  run: WorkflowRunSnapshot
): WorkflowRunSnapshot['nodes'][number] | null {
  for (const status of ['failed', 'running', 'ready'] as const) {
    const node = run.nodes.find((candidate) => candidate.status === status)
    if (node) return node
  }

  const rootBlockId = getWorkflowRunRootBlockIds(run)[0]
  return run.nodes.find((node) => node.blockId === rootBlockId) ?? null
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

function createWorkflowRunScopeMessage(run: WorkflowRunSnapshot, t: Translate): string {
  const rootIds = getWorkflowRunRootBlockIds(run)
  const rootNames = rootIds
    .map((rootId) => run.nodes.find((node) => node.blockId === rootId)?.name)
    .filter((name): name is string => Boolean(name))

  if (rootNames.length === 1) {
    return t('workflow.scopeSingle', { rootName: rootNames[0], count: run.nodes.length })
  }

  if (rootNames.length > 1) {
    return t('workflow.scopeMultiple', {
      rootCount: rootNames.length,
      count: run.nodes.length
    })
  }

  return run.nodes.length > 0
    ? t('workflow.scopeCount', { count: run.nodes.length })
    : t('workflow.scopeEmpty')
}

const defaultTranslate: Translate = (key, variables) => translate('zh-CN', key, variables)
