import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type { AppNotificationInput } from './appNotifications'
import { translate, type Translate } from './i18n/messages'

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
  readonly onStop: () => Promise<void> | void
}

export function createWorkflowRunNotification(
  run: WorkflowRunSnapshot,
  { isStopping, onStop }: CreateWorkflowRunNotificationOptions,
  t: Translate = defaultTranslate
): AppNotificationInput {
  if (run.status === 'failed') {
    return createWorkflowFailureNotification(run, t)
  }

  const scopeMessage = createWorkflowRunScopeMessage(run, t)

  if (run.status === 'succeeded') {
    return {
      autoDismissMs: 4_000,
      kind: 'success',
      source: { label: scopeMessage },
      title: t('workflow.succeededTitle')
    }
  }

  if (run.status === 'stopped') {
    return {
      autoDismissMs: 4_000,
      kind: 'warning',
      source: { label: scopeMessage },
      title: t('workflow.stoppedTitle')
    }
  }

  return {
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
    source: { label: scopeMessage },
    title: run.status === 'ready' ? t('workflow.readyTitle') : t('workflow.runningTitle')
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
