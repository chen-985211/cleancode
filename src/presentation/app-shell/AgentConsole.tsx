import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type {
  AgentActivityStatus,
  AgentRuntimeChangedEvent,
  AgentSessionSnapshot
} from '../../contexts/agent/application/dto/AgentSessionProtocol'
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
import {
  applyAgentRuntimeEvent,
  rememberLatestAgentRuntimeEvent
} from './agentRuntimeReconciliation'
import { formatProviderDisplayName, useAgentProviderDescriptor } from './useAgentProviderCatalog'
import { useAgentProviderState } from './useAgentProviderState'
import { useAgentTerminalView } from './useAgentTerminalView'
import { useI18n } from './i18n/useI18n'
import { readTerminalSourceTheme } from './terminalTheme'
import { defaultTerminalDimensions } from './types'

interface AgentSessionBinding {
  readonly session: AgentSessionSnapshot
  readonly workspaceKey: string
}

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
  const supportsMcp = providerCatalog.descriptor?.capabilities.cleancodeMcp !== 'unsupported'
  const [session, setSession] = useState<AgentSessionSnapshot | null>(null)
  const [attachAttempt, setAttachAttempt] = useState(0)
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
  const activity = session?.runtime.activity.status ?? 'unavailable'
  const dimensionsRef = useRef<AgentTerminalMeasurement | null>(null)
  const isMountedRef = useRef(true)
  const pendingRuntimeEventsRef = useRef(new Map<string, AgentRuntimeChangedEvent>())
  const restartRequestRef = useRef<{
    readonly mode: 'new' | 'retry'
    readonly workspaceKey: string
  } | null>(null)
  const sessionBindingRef = useRef<AgentSessionBinding | null>(null)
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  const workspaceGenerationRef = useRef(0)

  const writeAgentInput = useCallback((input: string) => {
    const activeBinding = sessionBindingRef.current
    if (!activeBinding) return
    void window.cleancode?.writeAgentSession({ input, sessionId: activeBinding.session.sessionId })
  }, [])
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
  useAgentTerminalView({
    dimensionsRef,
    enabled: true,
    onDimensionsChange: recordTerminalDimensions,
    session,
    terminalElementRef,
    workspaceKey: currentWorkspaceKey
  })

  useLayoutEffect(() => {
    const pendingRuntimeEvents = pendingRuntimeEventsRef.current
    workspaceGenerationRef.current += 1
    pendingRuntimeEvents.clear()
    return () => {
      workspaceGenerationRef.current += 1
      pendingRuntimeEvents.clear()
    }
  }, [currentWorkspaceKey])

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
        const activeBinding = sessionBindingRef.current
        if (activeBinding?.session.sessionId !== event.sessionId) {
          rememberLatestAgentRuntimeEvent(pendingRuntimeEventsRef.current, event)
          return
        }
        const nextSession = applyAgentRuntimeEvent(activeBinding.session, event)
        if (nextSession === activeBinding.session) return
        sessionBindingRef.current = { ...activeBinding, session: nextSession }
        setSession(nextSession)
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
  }, [activeAgent.agentId, currentProjectDirectory, currentWorkspaceName, onGraphUpdated])

  useEffect(() => {
    let isCurrent = true

    async function attachSession(): Promise<void> {
      const api = window.cleancode
      if (
        !api?.attachAgentSession ||
        !currentWorkbench ||
        !currentWorkspace ||
        !currentWorkspaceKey
      ) {
        sessionBindingRef.current = null
        setSession(null)
        return
      }
      if (sessionBindingRef.current?.workspaceKey !== currentWorkspaceKey) {
        sessionBindingRef.current = null
        setSession(null)
      }
      if (!isTestRuntime() && measuredTerminalKey !== currentWorkspaceKey) return

      const measuredDimensions =
        dimensionsRef.current?.workspaceKey === currentWorkspaceKey
          ? dimensionsRef.current.dimensions
          : defaultTerminalDimensions
      const restartRequest = restartRequestRef.current
      const restartMode =
        restartRequest?.workspaceKey === currentWorkspaceKey ? restartRequest.mode : undefined
      const nextSession = await api.attachAgentSession({
        agentId: activeAgent.agentId,
        columns: measuredDimensions.columns,
        gitBranch: currentWorkspace.gitBranch,
        persistenceMode:
          currentWorkspace.gitBranch || currentWorkbench.gitBranches.length === 0
            ? 'persistent'
            : 'ephemeral',
        projectDirectory: currentWorkbench.project.directory,
        projectId: currentWorkbench.project.id,
        providerId: activeAgent.providerId,
        restartMode,
        rows: measuredDimensions.rows,
        terminalSourceTheme: readTerminalSourceTheme(),
        workspaceDirectory: currentWorkspace.directory,
        workspaceName: currentWorkspace.name
      })
      if (!isCurrent) return
      if (restartMode) restartRequestRef.current = null

      const pendingRuntimeEvent = pendingRuntimeEventsRef.current.get(nextSession.sessionId)
      const committedSession = pendingRuntimeEvent
        ? applyAgentRuntimeEvent(nextSession, pendingRuntimeEvent)
        : nextSession
      pendingRuntimeEventsRef.current.delete(nextSession.sessionId)
      sessionBindingRef.current = { session: committedSession, workspaceKey: currentWorkspaceKey }
      setSession(committedSession)

      const latestMeasurement = dimensionsRef.current
      if (
        latestMeasurement?.workspaceKey === currentWorkspaceKey &&
        !haveSameDimensions(measuredDimensions, latestMeasurement.dimensions)
      ) {
        void api.resizeAgentSession({
          ...latestMeasurement.dimensions,
          sessionId: nextSession.sessionId
        })
      }
    }

    void attachSession().catch(() => {
      if (!isCurrent) return
      sessionBindingRef.current = null
      setSession(null)
    })
    return () => {
      isCurrent = false
    }
  }, [
    activeAgent.agentId,
    activeAgent.providerId,
    attachAttempt,
    currentWorkbench,
    currentWorkspace,
    currentWorkspaceKey,
    measuredTerminalKey
  ])

  const agentApprovals =
    approvalController?.approvals.filter(
      (approval) => approval.request.agentId === activeAgent.agentId
    ) ?? []
  const activeApproval = agentApprovals[0]
  const activeApprovalPresentation = activeApproval
    ? resolveAgentApprovalPresentation(activeApproval, currentWorkbench?.graph ?? null)
    : null

  function restartSession(mode: 'new' | 'retry'): void {
    if (!currentWorkspaceKey) return
    restartRequestRef.current = { mode, workspaceKey: currentWorkspaceKey }
    setAttachAttempt((attempt) => attempt + 1)
  }

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
        const pendingRuntimeEvent = pendingRuntimeEventsRef.current.get(result.session.sessionId)
        const nextSession = pendingRuntimeEvent
          ? applyAgentRuntimeEvent(result.session, pendingRuntimeEvent)
          : result.session
        pendingRuntimeEventsRef.current.delete(result.session.sessionId)
        sessionBindingRef.current = { session: nextSession, workspaceKey: requestWorkspaceKey }
        setSession(nextSession)
      }
    } catch {
      if (isMountedRef.current && requestGeneration === workspaceGenerationRef.current) {
        setMcpCapabilityError(t('agent.mcpUpdateFailed'))
      }
    } finally {
      if (isMountedRef.current) setIsMcpCapabilityUpdating(false)
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
                  <AgentProviderIdentity activity={activity} providerName={providerName} />
                  {onMcpCapabilityChange && supportsMcp ? (
                    <AgentMcpCapabilityToggle
                      enabled={agent.cleancodeMcpEnabled}
                      error={mcpCapabilityError}
                      onChange={(enabled) => void updateMcpCapability(enabled)}
                      pending={isMcpCapabilityUpdating}
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
              <AgentProviderIdentity activity={activity} providerName={providerName} />
            </>
          )}
        </div>
        <AgentProviderStatusView
          providerName={providerName}
          runtime={session?.runtime ?? null}
          state={providerController.state}
          onNewConversation={() => restartSession('new')}
          onRetryInspection={providerController.retry}
          onRetryRestore={() => restartSession('retry')}
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
  providerName
}: {
  readonly activity: AgentActivityStatus
  readonly providerName: string
}) {
  const { t } = useI18n()
  const activityLabel = activity === 'unavailable' ? null : t(`agent.activity.${activity}` as const)
  return (
    <span
      aria-label={
        activityLabel
          ? t('agent.providerActivity', { activity: activityLabel, provider: providerName })
          : providerName
      }
      className="agent-console__provider-identity"
      data-activity={activity}
    >
      <span aria-hidden="true" />
      {providerName}
    </span>
  )
}

function haveSameDimensions(
  left: AgentTerminalMeasurement['dimensions'],
  right: AgentTerminalMeasurement['dimensions']
): boolean {
  return left.columns === right.columns && left.rows === right.rows
}
