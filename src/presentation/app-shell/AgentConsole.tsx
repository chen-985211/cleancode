import { useCallback, useEffect, useRef, useState } from 'react'

import type { AgentActivityStatus } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import { AgentConsoleActions } from './AgentConsoleActions'
import { AgentMcpCapabilityToggle } from './AgentMcpCapabilityToggle'
import { AgentProviderStatusView } from './AgentProviderStatusView'
import { AgentTerminalSurface } from './AgentTerminalSurface'
import { AgentToolApprovalCard } from './AgentToolApprovalCard'
import { resolveAgentApprovalPresentation } from './agentApprovalPresentation'
import {
  createFallbackAgent,
  createWorkspaceKey,
  isTestRuntime,
  noop,
  type AgentConsoleProps,
  type AgentTerminalMeasurement
} from './agentConsoleModel'
import { formatProviderDisplayName, useAgentProviderDescriptor } from './useAgentProviderCatalog'
import { useAgentProviderState } from './useAgentProviderState'
import { useAgentSessionAttachment } from './useAgentSessionAttachment'
import { useAgentTerminalView } from './useAgentTerminalView'
import { useI18n } from './i18n/useI18n'

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
  const activeAgent = agent ?? createFallbackAgent(currentWorkbench, currentWorkspace)
  const providerController = useAgentProviderState(activeAgent.providerId)
  const providerCatalog = useAgentProviderDescriptor(activeAgent.providerId)
  const providerName =
    providerCatalog.descriptor?.displayName ?? formatProviderDisplayName(activeAgent.providerId)
  const supportsMcp =
    providerCatalog.descriptor !== null &&
    providerCatalog.descriptor.capabilities.cleancodeMcp !== 'unsupported'
  const [measuredTerminalKey, setMeasuredTerminalKey] = useState<string | null>(null)
  const [isMcpCapabilityUpdating, setIsMcpCapabilityUpdating] = useState(false)
  const [mcpCapabilityError, setMcpCapabilityError] = useState<string | null>(null)
  const currentWorkspaceKey = createWorkspaceKey(
    currentWorkbench,
    currentWorkspace,
    activeAgent.agentId
  )
  const currentProjectDirectory = currentWorkbench?.project.directory ?? null
  const currentWorkspaceName = currentWorkspace?.name ?? null
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
  useAgentTerminalView({
    dimensionsRef,
    enabled: true,
    onDimensionsChange: recordTerminalDimensions,
    session,
    terminalElementRef,
    workspaceKey: currentWorkspaceKey
  })
  const activity = session?.runtime.activity.status ?? 'unavailable'
  const showActivity =
    providerCatalog.descriptor?.capabilities.activityTracking === true && activity !== 'unavailable'
  const isAttachPending = attachOperation.status === 'pending'

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const api = window.cleancode
    if (!api || !currentProjectDirectory || !currentWorkspaceName) return undefined

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
          currentWorkspaceName === event.workspaceName
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
    currentWorkspaceName,
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

  async function updateMcpCapability(enabled: boolean): Promise<void> {
    if (!agent || !onMcpCapabilityChange || isMcpCapabilityUpdating) return
    const requestGeneration = workspaceGenerationRef.current
    const requestWorkspaceKey = currentWorkspaceKey
    setIsMcpCapabilityUpdating(true)
    setMcpCapabilityError(null)
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
    } catch {
      if (isMountedRef.current && requestGeneration === workspaceGenerationRef.current) {
        setMcpCapabilityError(t('agent.mcpUpdateFailed'))
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
              capabilityControl={
                <span className="agent-console__provider-controls">
                  <AgentProviderIdentity
                    activity={activity}
                    providerName={providerName}
                    showActivity={showActivity}
                  />
                  {onMcpCapabilityChange && supportsMcp ? (
                    <AgentMcpCapabilityToggle
                      enabled={agent.cleancodeMcpEnabled}
                      error={mcpCapabilityError}
                      onChange={(enabled) => void updateMcpCapability(enabled)}
                      pending={isMcpCapabilityUpdating || isAttachPending}
                    />
                  ) : null}
                </span>
              }
              onRemove={onRemove}
              onRename={onRename}
              onSelect={onSelect ?? noop}
            />
          ) : (
            <>
              <strong className="agent-console__title">{activeAgent.name}</strong>
              <AgentProviderIdentity
                activity={activity}
                providerName={providerName}
                showActivity={showActivity}
              />
            </>
          )}
        </div>
        <AgentProviderStatusView
          attachment={attachOperation}
          onRetryAttachment={retryAttachment}
          providerName={providerName}
          runtime={session?.runtime ?? null}
          state={providerController.state}
          onNewConversation={() => requestRestart('new')}
          onRetryInspection={providerController.retry}
          onRetryRestore={
            providerCatalog.descriptor?.capabilities.resume === true
              ? () => requestRestart('retry')
              : undefined
          }
        />
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
        role="region"
        aria-label={t('agent.cliSession', { provider: providerName })}
      >
        {currentWorkspaceKey ? (
          <AgentTerminalSurface
            activeOutput=""
            providerName={providerName}
            terminalElementRef={terminalElementRef}
            onFallbackInput={writeAgentInput}
            session={session}
            useFallback={isTestRuntime()}
          />
        ) : (
          <div className="agent-console__empty">{t('agent.noWorkspace')}</div>
        )}
      </div>
    </div>
  )
}

function AgentProviderIdentity({
  activity,
  providerName,
  showActivity
}: {
  readonly activity: AgentActivityStatus
  readonly providerName: string
  readonly showActivity: boolean
}) {
  const { t } = useI18n()
  const activityLabel =
    showActivity && activity !== 'unavailable' ? t(`agent.activity.${activity}` as const) : null
  return (
    <span
      aria-label={
        activityLabel
          ? t('agent.providerActivity', { activity: activityLabel, provider: providerName })
          : providerName
      }
      className="agent-console__provider-identity"
      data-activity={showActivity ? activity : undefined}
      title={providerName}
    >
      {showActivity ? (
        <span aria-hidden="true" className="agent-console__activity-indicator" />
      ) : null}
      <span className="agent-console__provider-name">{providerName}</span>
    </span>
  )
}
