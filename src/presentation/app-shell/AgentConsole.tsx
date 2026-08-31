import { useCallback, useEffect, useRef, useState } from 'react'

import type { AgentProviderIcon as AgentProviderIconDescriptor } from '../../contexts/agent/application/ports/AgentProviderContribution'
import { AgentMcpCapabilityToggle } from '../../contexts/agent/presentation/components/AgentMcpCapabilityToggle'
import { AgentProviderIcon } from '../../contexts/agent/presentation/components/AgentProviderIcon'
import {
  AgentProviderBlockingState,
  AgentProviderStatusControl
} from '../../contexts/agent/presentation/components/AgentProviderStatusView'
import { AgentConsoleActions } from './AgentConsoleActions'
import { AgentTerminalSurface } from './AgentTerminalSurface'
import { AgentToolApprovalCard } from './AgentToolApprovalCard'
import { resolveAgentApprovalPresentation } from './agentApprovalPresentation'
import { deriveAgentProviderFeedback } from '../../contexts/agent/presentation/view-models/agentProviderFeedback'
import {
  createFallbackAgent,
  createWorkspaceKey,
  isTestRuntime,
  noop,
  type AgentConsoleProps,
  type AgentTerminalMeasurement
} from './agentConsoleModel'
import {
  formatProviderDisplayName,
  useAgentProviderDescriptor
} from '../../contexts/agent/presentation/view-models/useAgentProviderCatalog'
import { useAgentProviderState } from '../../contexts/agent/presentation/view-models/useAgentProviderState'
import { useAgentProviderNotifications } from '../../contexts/agent/presentation/view-models/useAgentProviderNotifications'
import { useAgentSessionAttachment } from './useAgentSessionAttachment'
import { useAgentTerminalView } from './useAgentTerminalView'
import { useI18n } from '../i18n/useI18n'
import { useOptionalNotifications } from './useNotifications'

export function AgentConsole({
  agent,
  approvalController,
  currentWorkbench = null,
  currentWorkspace = null,
  onGraphUpdated,
  onMcpCapabilityChange,
  onRemove,
  onRename,
  onSelect
}: AgentConsoleProps) {
  const { t } = useI18n()
  const notifications = useOptionalNotifications()
  const activeAgent = agent ?? createFallbackAgent(currentWorkbench, currentWorkspace)
  const providerController = useAgentProviderState(activeAgent.providerId)
  const providerCatalog = useAgentProviderDescriptor(activeAgent.providerId)
  const providerName =
    providerCatalog.descriptor?.displayName ?? formatProviderDisplayName(activeAgent.providerId)
  const supportsMcp =
    providerCatalog.descriptor !== null && providerCatalog.descriptor.capabilities.cleancodeMcp
  const [measuredTerminalKey, setMeasuredTerminalKey] = useState<string | null>(null)
  const [isMcpCapabilityUpdating, setIsMcpCapabilityUpdating] = useState(false)
  const currentWorkspaceKey = createWorkspaceKey(
    currentWorkbench,
    currentWorkspace,
    activeAgent.agentId
  )
  const currentProjectDirectory = currentWorkbench?.project.directory ?? null
  const currentWorkspaceId = currentWorkspace?.workspaceId ?? null
  const dimensionsRef = useRef<AgentTerminalMeasurement | null>(null)
  const isMountedRef = useRef(true)
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  const recordTerminalDimensions = useCallback(
    (dimensions: AgentTerminalMeasurement['dimensions']) => {
      if (!currentWorkspaceKey) return
      dimensionsRef.current = { dimensions, workspaceKey: currentWorkspaceKey }
      setMeasuredTerminalKey((currentKey) =>
        currentKey === currentWorkspaceKey ? currentKey : currentWorkspaceKey
      )
    },
    [currentWorkspaceKey]
  )
  const {
    applyRuntimeChange,
    operation: attachOperation,
    replaceSession,
    requestRestart,
    retryAttachment,
    scopeGenerationRef: workspaceGenerationRef,
    session,
    writeInput: writeAgentInput
  } = useAgentSessionAttachment({
    activeAgent,
    currentWorkbench,
    currentWorkspace,
    currentWorkspaceKey,
    dimensionsRef,
    measuredTerminalKey
  })
  const providerFeedback = deriveAgentProviderFeedback({
    attachment: attachOperation,
    runtime: session?.runtime ?? null,
    state: providerController.state
  })
  useAgentProviderNotifications({
    events: providerFeedback.events,
    notifications,
    scopeKey: currentWorkspaceKey
  })
  useAgentTerminalView({
    dimensionsRef,
    enabled: true,
    onDimensionsChange: recordTerminalDimensions,
    session,
    terminalElementRef,
    workspaceKey: currentWorkspaceKey
  })
  const isAttachPending = attachOperation.status === 'pending'

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const api = window.cleancode
    if (!api || !currentProjectDirectory || !currentWorkspaceId) return undefined

    const unsubscribeRuntime =
      api.onAgentRuntimeChanged?.((event) => {
        if (event.agentId !== activeAgent.agentId) return
        applyRuntimeChange(event)
      }) ?? noop
    const unsubscribeGraph =
      api.onAgentGraphUpdated?.((event) => {
        if (
          (!event.agentId || event.agentId === activeAgent.agentId) &&
          currentProjectDirectory === event.projectDirectory &&
          currentWorkspaceId === event.workspaceId
        ) {
          onGraphUpdated?.(event)
        }
      }) ?? noop
    return () => {
      unsubscribeRuntime()
      unsubscribeGraph()
    }
  }, [
    activeAgent.agentId,
    applyRuntimeChange,
    currentProjectDirectory,
    currentWorkspaceId,
    onGraphUpdated
  ])

  const agentApprovals =
    approvalController?.approvals.filter(
      (approval) => approval.request.agentId === activeAgent.agentId
    ) ?? []
  const activeApproval = agentApprovals[0]
  const activeApprovalPresentation = activeApproval
    ? resolveAgentApprovalPresentation(activeApproval, currentWorkbench?.graph ?? null)
    : null

  async function updateMcpCapability(
    enabled: boolean,
    intent: 'reconnect' | 'toggle' = 'toggle'
  ): Promise<void> {
    if (!agent || !onMcpCapabilityChange || isMcpCapabilityUpdating) return
    const requestGeneration = workspaceGenerationRef.current
    const requestWorkspaceKey = currentWorkspaceKey
    setIsMcpCapabilityUpdating(true)
    try {
      const result = await onMcpCapabilityChange(agent, enabled)
      if (!result) return
      approvalController?.clearForAgent(activeAgent.agentId)
      if (
        !isMountedRef.current ||
        !requestWorkspaceKey ||
        requestGeneration !== workspaceGenerationRef.current
      ) {
        return
      }
      if (result.session) {
        replaceSession(result.session)
      }
      if (result.session?.runtime.mcp.status === 'failed') {
        notifications.notify({
          autoDismissMs: 6_000,
          kind: 'warning',
          title: t(intent === 'reconnect' ? 'agent.mcpReconnectFailed' : 'agent.mcpUpdateFailed')
        })
      }
    } catch {
      if (isMountedRef.current && requestGeneration === workspaceGenerationRef.current) {
        notifications.notify({
          autoDismissMs: 6_000,
          kind: 'warning',
          title: t(intent === 'reconnect' ? 'agent.mcpReconnectFailed' : 'agent.mcpUpdateFailed')
        })
      }
    } finally {
      if (isMountedRef.current && requestGeneration === workspaceGenerationRef.current) {
        setIsMcpCapabilityUpdating(false)
      }
    }
  }

  return (
    <div className="agent-console">
      <div
        className="agent-console__header"
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest('button, input, form, [role="menu"]')) {
            onSelect?.()
          }
        }}
      >
        <div className="agent-console__title-row">
          {agent && onRename && onRemove ? (
            <AgentConsoleActions
              agent={agent}
              identityControl={
                <AgentProviderIdentity
                  icon={providerCatalog.descriptor?.icon ?? null}
                  providerName={providerName}
                />
              }
              capabilityControl={
                onMcpCapabilityChange && supportsMcp ? (
                  <AgentMcpCapabilityToggle
                    enabled={agent.cleancodeMcpEnabled}
                    onChange={(enabled) => void updateMcpCapability(enabled)}
                    onReconnect={
                      providerCatalog.descriptor?.capabilities.resume === true
                        ? () => void updateMcpCapability(true, 'reconnect')
                        : undefined
                    }
                    pending={isMcpCapabilityUpdating || isAttachPending}
                    status={providerFeedback.mcpStatus}
                  />
                ) : null
              }
              onRemove={onRemove}
              onRename={onRename}
              onSelect={onSelect ?? noop}
              statusControl={
                <AgentProviderStatusControl
                  agentName={activeAgent.name}
                  issues={providerFeedback.issues}
                  onNewConversation={() => requestRestart('new')}
                  onRestart={
                    providerCatalog.descriptor?.capabilities.resume === true
                      ? () => requestRestart('retry')
                      : undefined
                  }
                  onRetryAttachment={retryAttachment}
                  providerName={providerName}
                  state={providerController.state}
                />
              }
            />
          ) : (
            <div className="agent-console-actions">
              <div className="agent-console-actions__start">
                <AgentProviderIdentity
                  icon={providerCatalog.descriptor?.icon ?? null}
                  providerName={providerName}
                />
                <strong className="agent-console__title">{activeAgent.name}</strong>
              </div>
              <div className="agent-console-actions__center" />
              <div className="agent-console-actions__end">
                <AgentProviderStatusControl
                  agentName={activeAgent.name}
                  issues={providerFeedback.issues}
                  onNewConversation={() => requestRestart('new')}
                  onRestart={
                    providerCatalog.descriptor?.capabilities.resume === true
                      ? () => requestRestart('retry')
                      : undefined
                  }
                  onRetryAttachment={retryAttachment}
                  providerName={providerName}
                  state={providerController.state}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {activeApproval && activeApprovalPresentation && approvalController ? (
        <AgentToolApprovalCard
          presentation={activeApprovalPresentation}
          queueCount={Math.max(0, agentApprovals.length - 1)}
          onApprove={() => void approvalController.approve(activeApproval.request)}
          onDismiss={() => approvalController.dismiss(activeApproval.request)}
          onLocate={() => approvalController.locate(activeApproval.request)}
          onReject={() => void approvalController.reject(activeApproval.request)}
        />
      ) : null}
      <div
        aria-busy={attachOperation.status === 'measuring' || attachOperation.status === 'pending'}
        className="agent-console__terminal-shell"
        data-agent-attach-operation-status={attachOperation.status}
        role="region"
        aria-label={t('agent.cliSession', { provider: providerName })}
      >
        {providerFeedback.blocking ? (
          <AgentProviderBlockingState
            blocking={providerFeedback.blocking}
            onRetryAttachment={retryAttachment}
            onRetryInspection={providerController.retry}
            providerName={providerName}
            state={providerController.state}
          />
        ) : currentWorkspaceKey ? (
          <AgentTerminalSurface
            activeOutput=""
            providerName={providerName}
            terminalElementRef={terminalElementRef}
            onFallbackInput={writeAgentInput}
            session={session}
            useFallback={isTestRuntime()}
            workspaceDisplayName={currentWorkspace?.displayName}
          />
        ) : (
          <div className="agent-console__empty">{t('agent.noWorkspace')}</div>
        )}
      </div>
    </div>
  )
}

function AgentProviderIdentity({
  icon,
  providerName
}: {
  readonly icon: AgentProviderIconDescriptor | null
  readonly providerName: string
}) {
  return (
    <span
      aria-label={providerName}
      className="agent-console__provider-identity"
      role="img"
      title={providerName}
    >
      <AgentProviderIcon icon={icon} />
    </span>
  )
}
