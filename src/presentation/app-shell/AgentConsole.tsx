import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { AgentSessionSnapshot } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import {
  defaultAgentXtermDimensions,
  readAgentTerminalSourceTheme,
  type AgentXtermController,
  type AgentXtermSurface
} from './agentTerminalXterm'
import { AgentConsoleActions } from './AgentConsoleActions'
import { AgentMcpCapabilityToggle } from './AgentMcpCapabilityToggle'
import { AgentTerminalSurface } from './AgentTerminalSurface'
import { CodexCliStatusView } from './CodexCliStatusView'
import { AgentToolApprovalCard } from './AgentToolApprovalCard'
import { resolveAgentApprovalPresentation } from './agentApprovalPresentation'
import {
  createFallbackAgent,
  createAgentTerminalOwner,
  createWorkspaceKey,
  haveSameDimensions,
  isTestRuntime,
  noop,
  restoreRecordedAgentSessionExit,
  type AgentConsoleProps,
  type AgentSessionBinding,
  type AgentTerminalMeasurement
} from './agentConsoleModel'
import { useCodexCliState } from './useCodexCliState'
import { useAgentTerminalEvents } from './useAgentTerminalEvents'
import { useAgentTerminalSurface } from './useAgentTerminalSurface'
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
  const codexCliController = useCodexCliState()
  const agentTerminalEvents = useAgentTerminalEvents()
  const [session, setSession] = useState<AgentSessionSnapshot | null>(null)
  const [activeOutput, setActiveOutput] = useState('')
  const [attachAttempt, setAttachAttempt] = useState(0)
  const [isMcpCapabilityUpdating, setIsMcpCapabilityUpdating] = useState(false)
  const [mcpCapabilityError, setMcpCapabilityError] = useState<string | null>(null)
  const [measuredTerminalKey, setMeasuredTerminalKey] = useState<string | null>(null)
  const currentWorkspaceKey = createWorkspaceKey(
    currentWorkbench,
    currentWorkspace,
    activeAgent.agentId
  )
  const currentProjectDirectory = currentWorkbench?.project.directory ?? null
  const currentWorkspaceName = currentWorkspace?.name ?? null
  const dimensionsRef = useRef<AgentTerminalMeasurement | null>(null)
  const isMountedRef = useRef(true)
  const restartRequestRef = useRef<{
    readonly mode: 'new' | 'retry'
    readonly workspaceKey: string
  } | null>(null)
  const sessionBindingRef = useRef<AgentSessionBinding | null>(null)
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  const workspaceGenerationRef = useRef(0)
  const xtermRef = useRef<AgentXtermSurface | null>(null)
  const writeAgentInput = useCallback((input: string) => {
    const activeBinding = sessionBindingRef.current

    if (!activeBinding || activeBinding.terminalController !== xtermRef.current) return

    void window.cleancode?.writeAgentSession({
      input,
      sessionId: activeBinding.session.sessionId
    })
  }, [])
  useAgentTerminalSurface({
    agentId: activeAgent.agentId,
    dimensionsRef,
    events: agentTerminalEvents,
    projectId: currentWorkbench?.project.id ?? null,
    sessionBindingRef,
    setMeasuredTerminalKey,
    terminalElementRef,
    workspaceKey: currentWorkspaceKey,
    workspaceName: currentWorkspaceName,
    xtermRef
  })

  useLayoutEffect(() => {
    workspaceGenerationRef.current += 1
    return () => {
      workspaceGenerationRef.current += 1
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

    if (!api || !currentProjectDirectory || !currentWorkspaceName) {
      return undefined
    }

    const unsubscribeOutput = agentTerminalEvents.subscribeOutput((event, nextOutput) => {
      if (event.agentId && event.agentId !== activeAgent.agentId) return
      const activeBinding = sessionBindingRef.current

      if (
        event.sessionId === activeBinding?.session.sessionId &&
        activeBinding.terminalController === xtermRef.current
      ) {
        setActiveOutput(nextOutput)
      }
    })
    const unsubscribeExit = agentTerminalEvents.subscribeExit((event) => {
      if (event.agentId && event.agentId !== activeAgent.agentId) return
      const activeBinding = sessionBindingRef.current
      if (
        event.sessionId === activeBinding?.session.sessionId &&
        activeBinding.terminalController === xtermRef.current
      ) {
        setSession((currentSession) =>
          currentSession && currentSession.sessionId === event.sessionId
            ? { ...currentSession, status: 'exited' }
            : currentSession
        )
      }
    })
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
      unsubscribeOutput()
      unsubscribeExit()
      unsubscribeGraph()
    }
  }, [
    activeAgent.agentId,
    agentTerminalEvents,
    currentProjectDirectory,
    currentWorkspaceName,
    onGraphUpdated
  ])

  useEffect(() => {
    let isCurrent = true
    let replacementController: AgentXtermController | null = null

    async function attachSession(): Promise<void> {
      const api = window.cleancode

      if (!api?.attachAgentSession || !currentWorkbench || !currentWorkspace) {
        sessionBindingRef.current = null
        setSession(null)
        setActiveOutput('')
        return
      }

      if (sessionBindingRef.current?.workspaceKey !== currentWorkspaceKey) {
        sessionBindingRef.current = null
        setSession(null)
        setActiveOutput('')
      }

      const measuredDimensions = isTestRuntime()
        ? defaultAgentXtermDimensions
        : dimensionsRef.current?.workspaceKey === currentWorkspaceKey &&
            measuredTerminalKey === currentWorkspaceKey
          ? dimensionsRef.current.dimensions
          : null

      if (!measuredDimensions || !currentWorkspaceKey) {
        return
      }

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
        restartMode,
        rows: measuredDimensions.rows,
        terminalSourceTheme: readAgentTerminalSourceTheme(),
        workspaceDirectory: currentWorkspace.directory,
        workspaceName: currentWorkspace.name
      })

      if (!isCurrent) {
        return
      }

      if (restartMode) {
        restartRequestRef.current = null
      }
      const currentBinding = sessionBindingRef.current
      const terminalOwner = createAgentTerminalOwner(
        activeAgent.agentId,
        currentWorkbench.project.id,
        currentWorkspace.name
      )
      const commitSession = (
        restoredOutput: string,
        terminalController: AgentXtermController | null
      ): boolean => {
        if (!isCurrent) return false
        const committedSession = restoreRecordedAgentSessionExit(
          nextSession,
          agentTerminalEvents.exitedSessionIds
        )
        sessionBindingRef.current = {
          session: committedSession,
          terminalController,
          workspaceKey: currentWorkspaceKey
        }
        setSession(committedSession)
        setActiveOutput(restoredOutput)
        return true
      }

      if (
        (currentBinding?.workspaceKey === currentWorkspaceKey &&
          currentBinding.session.sessionId === nextSession.sessionId &&
          currentBinding.terminalController === xtermRef.current) ||
        (xtermRef.current &&
          agentTerminalEvents.surfaceRegistry.isBound(
            terminalOwner,
            nextSession.sessionId,
            xtermRef.current
          ))
      ) {
        commitSession(agentTerminalEvents.readOutput(nextSession.sessionId), xtermRef.current)
      } else {
        const terminalController = xtermRef.current
        sessionBindingRef.current = null

        if (isTestRuntime() || !terminalController) {
          commitSession(agentTerminalEvents.readOutput(nextSession.sessionId), null)
        } else {
          let startupOutput = ''
          replacementController = terminalController
          await terminalController
            .replaceSession({
              onBind: () => {
                if (xtermRef.current !== terminalController) return false
                startupOutput = agentTerminalEvents.surfaceRegistry.bind(
                  terminalOwner,
                  nextSession.sessionId,
                  terminalController
                )
                return commitSession(
                  agentTerminalEvents.readOutput(nextSession.sessionId),
                  terminalController
                )
              },
              replayOutput: () => startupOutput,
              sessionId: nextSession.sessionId,
              terminalSourceTheme: nextSession.terminalSourceTheme
            })
            .catch(() => {
              if (xtermRef.current === terminalController) {
                const pendingOutput = agentTerminalEvents.surfaceRegistry.bind(
                  terminalOwner,
                  nextSession.sessionId,
                  terminalController
                )
                commitSession(
                  agentTerminalEvents.readOutput(nextSession.sessionId),
                  terminalController
                )
                if (pendingOutput) terminalController.write(pendingOutput)
              }
            })
        }
      }

      if (!isCurrent) return

      const latestMeasurement = dimensionsRef.current
      if (
        latestMeasurement?.workspaceKey === currentWorkspaceKey &&
        !haveSameDimensions(measuredDimensions, latestMeasurement.dimensions)
      ) {
        void api.resizeAgentSession?.({
          ...latestMeasurement.dimensions,
          sessionId: nextSession.sessionId
        })
      }
    }

    void attachSession().catch(() => {
      if (!isCurrent) return
      sessionBindingRef.current = null
      setSession(null)
      setActiveOutput('')
    })

    return () => {
      isCurrent = false
      replacementController?.invalidateSessionReplacement()
    }
  }, [
    activeAgent.agentId,
    agentTerminalEvents,
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
    const requestController = xtermRef.current
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
        requestGeneration !== workspaceGenerationRef.current ||
        requestController !== xtermRef.current
      ) {
        return
      }
      if (result.session) {
        const nextSession = result.session
        const terminalOwner = createAgentTerminalOwner(
          activeAgent.agentId,
          nextSession.projectId,
          nextSession.workspaceName
        )
        let startupOutput = ''
        sessionBindingRef.current = null

        if (isTestRuntime() || !requestController) {
          const restoredOutput = agentTerminalEvents.readOutput(nextSession.sessionId)
          const committedSession = restoreRecordedAgentSessionExit(
            nextSession,
            agentTerminalEvents.exitedSessionIds
          )
          sessionBindingRef.current = {
            session: committedSession,
            terminalController: null,
            workspaceKey: requestWorkspaceKey
          }
          setSession(committedSession)
          setActiveOutput(restoredOutput)
        } else {
          await requestController.replaceSession({
            onBind: () => {
              if (
                requestGeneration !== workspaceGenerationRef.current ||
                xtermRef.current !== requestController
              ) {
                return false
              }
              startupOutput = agentTerminalEvents.surfaceRegistry.bind(
                terminalOwner,
                nextSession.sessionId,
                requestController
              )
              const committedSession = restoreRecordedAgentSessionExit(
                nextSession,
                agentTerminalEvents.exitedSessionIds
              )
              sessionBindingRef.current = {
                session: committedSession,
                terminalController: requestController,
                workspaceKey: requestWorkspaceKey
              }
              setSession(committedSession)
              setActiveOutput(agentTerminalEvents.readOutput(nextSession.sessionId))
            },
            replayOutput: () => startupOutput,
            sessionId: nextSession.sessionId,
            terminalSourceTheme: nextSession.terminalSourceTheme
          })
        }
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
                onMcpCapabilityChange ? (
                  <AgentMcpCapabilityToggle
                    enabled={agent.cleancodeMcpEnabled}
                    error={mcpCapabilityError}
                    onChange={(enabled) => void updateMcpCapability(enabled)}
                    pending={isMcpCapabilityUpdating}
                  />
                ) : undefined
              }
              onRemove={onRemove}
              onRename={onRename}
              onSelect={onSelect ?? noop}
            />
          ) : (
            <strong className="agent-console__title">{activeAgent.name}</strong>
          )}
        </div>
        <CodexCliStatusView
          state={codexCliController.state}
          sessionStatus={session?.status ?? null}
          onNewConversation={() => restartSession('new')}
          onRetryInspection={codexCliController.retry}
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
        aria-label={t('agent.cliSession')}
      >
        {currentWorkspaceKey ? (
          <AgentTerminalSurface
            activeOutput={activeOutput}
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
