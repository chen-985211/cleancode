import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { AgentSessionSnapshot } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import {
  defaultAgentXtermDimensions,
  installAgentXterm,
  readAgentTerminalSourceTheme,
  type AgentXtermController
} from './agentTerminalXterm'
import { AgentConsoleActions } from './AgentConsoleActions'
import { AgentMcpCapabilityToggle } from './AgentMcpCapabilityToggle'
import { AgentTerminalSurface } from './AgentTerminalSurface'
import { appendTerminalOutputForSession } from './terminalOutputTail'
import { CodexCliStatusView } from './CodexCliStatusView'
import { AgentToolApprovalCard } from './AgentToolApprovalCard'
import { resolveAgentApprovalPresentation } from './agentApprovalPresentation'
import {
  createFallbackAgent,
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
  const activeAgent = agent ?? createFallbackAgent(currentWorkbench, currentWorkspace)
  const codexCliState = useCodexCliState()
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
  const exitedSessionIdsRef = useRef(new Set<string>())
  const isMountedRef = useRef(true)
  const outputBySessionRef = useRef(new Map<string, string>())
  const restartRequestRef = useRef<{
    readonly mode: 'new' | 'retry'
    readonly workspaceKey: string
  } | null>(null)
  const sessionBindingRef = useRef<AgentSessionBinding | null>(null)
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  const workspaceGenerationRef = useRef(0)
  const xtermRef = useRef<AgentXtermController | null>(null)
  const writeAgentInput = useCallback((input: string) => {
    const activeBinding = sessionBindingRef.current

    if (!activeBinding || activeBinding.terminalController !== xtermRef.current) {
      return
    }

    void window.cleancode?.writeAgentSession({
      input,
      sessionId: activeBinding.session.sessionId
    })
  }, [])

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

    const unsubscribeOutput =
      api.onAgentPtyOutput?.((event) => {
        if (event.agentId && event.agentId !== activeAgent.agentId) return
        const nextOutput = appendTerminalOutputForSession(outputBySessionRef.current, event)
        const activeBinding = sessionBindingRef.current

        if (
          event.sessionId === activeBinding?.session.sessionId &&
          activeBinding.terminalController === xtermRef.current
        ) {
          setActiveOutput(nextOutput)
          xtermRef.current?.write(event.data)
        }
      }) ?? noop
    const unsubscribeExit =
      api.onAgentPtyExit?.((event) => {
        if (event.agentId && event.agentId !== activeAgent.agentId) return
        exitedSessionIdsRef.current.add(event.sessionId)
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
      }) ?? noop
    const unsubscribeGraph =
      api.onAgentGraphUpdated?.((event) => {
        if (
          (!event.agentId || event.agentId === activeAgent.agentId) &&
          currentProjectDirectory === event.projectDirectory &&
          currentWorkspaceName === event.workspaceName
        ) {
          onGraphUpdated?.(event.graph)
        }
      }) ?? noop
    return () => {
      unsubscribeOutput()
      unsubscribeExit()
      unsubscribeGraph()
    }
  }, [activeAgent.agentId, currentProjectDirectory, currentWorkspaceName, onGraphUpdated])

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
      const commitSession = (
        restoredOutput: string,
        terminalController: AgentXtermController | null
      ): boolean => {
        if (!isCurrent) return false
        const committedSession = restoreRecordedAgentSessionExit(
          nextSession,
          exitedSessionIdsRef.current
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
        currentBinding?.workspaceKey === currentWorkspaceKey &&
        currentBinding.session.sessionId === nextSession.sessionId &&
        currentBinding.terminalController === xtermRef.current
      ) {
        commitSession(
          outputBySessionRef.current.get(nextSession.sessionId) ?? '',
          currentBinding.terminalController
        )
      } else {
        const terminalController = xtermRef.current
        sessionBindingRef.current = null

        if (isTestRuntime() || !terminalController) {
          commitSession(outputBySessionRef.current.get(nextSession.sessionId) ?? '', null)
        } else {
          let restoredOutput = ''
          replacementController = terminalController
          await terminalController
            .replaceSession({
              onBind: () =>
                xtermRef.current === terminalController &&
                commitSession(restoredOutput, terminalController),
              replayOutput: () => {
                restoredOutput = outputBySessionRef.current.get(nextSession.sessionId) ?? ''
                return restoredOutput
              },
              sessionId: nextSession.sessionId,
              terminalSourceTheme: nextSession.terminalSourceTheme
            })
            .catch(() => {
              if (xtermRef.current === terminalController) {
                commitSession(
                  outputBySessionRef.current.get(nextSession.sessionId) ?? '',
                  terminalController
                )
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
    attachAttempt,
    currentWorkbench,
    currentWorkspace,
    currentWorkspaceKey,
    measuredTerminalKey
  ])

  useEffect(() => {
    if (isTestRuntime() || !terminalElementRef.current) {
      return undefined
    }

    return installAgentXterm({
      element: terminalElementRef.current,
      initialOutput: '',
      onDimensionsChange: (dimensions) => {
        if (!currentWorkspaceKey) return
        dimensionsRef.current = { dimensions, workspaceKey: currentWorkspaceKey }
        setMeasuredTerminalKey((currentKey) =>
          currentKey === currentWorkspaceKey ? currentKey : currentWorkspaceKey
        )
        const activeBinding = sessionBindingRef.current

        if (
          activeBinding?.workspaceKey === currentWorkspaceKey &&
          activeBinding.terminalController === xtermRef.current
        ) {
          void window.cleancode?.resizeAgentSession({
            ...dimensions,
            sessionId: activeBinding.session.sessionId
          })
        }
      },
      onInput: writeAgentInput,
      xtermRef
    })
  }, [currentWorkspaceKey, writeAgentInput])

  const agentApprovals =
    approvalController?.approvals.filter(
      (approval) => approval.request.agentId === activeAgent.agentId
    ) ?? []
  const activeApproval = agentApprovals[0]
  const activeApprovalPresentation = activeApproval
    ? resolveAgentApprovalPresentation(activeApproval, currentWorkbench?.graph ?? null)
    : null
  function restartSession(mode: 'new' | 'retry'): void {
    if (!currentWorkspaceKey) {
      return
    }

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
        let restoredOutput = ''
        sessionBindingRef.current = null

        if (isTestRuntime() || !requestController) {
          restoredOutput = outputBySessionRef.current.get(nextSession.sessionId) ?? ''
          const committedSession = restoreRecordedAgentSessionExit(
            nextSession,
            exitedSessionIdsRef.current
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
              const committedSession = restoreRecordedAgentSessionExit(
                nextSession,
                exitedSessionIdsRef.current
              )
              sessionBindingRef.current = {
                session: committedSession,
                terminalController: requestController,
                workspaceKey: requestWorkspaceKey
              }
              setSession(committedSession)
              setActiveOutput(restoredOutput)
            },
            replayOutput: () => {
              restoredOutput = outputBySessionRef.current.get(nextSession.sessionId) ?? ''
              return restoredOutput
            },
            sessionId: nextSession.sessionId,
            terminalSourceTheme: nextSession.terminalSourceTheme
          })
        }
      }
    } catch {
      if (isMountedRef.current && requestGeneration === workspaceGenerationRef.current) {
        setMcpCapabilityError('未能切换 CleanCode MCP，请重试。')
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
          state={codexCliState}
          sessionStatus={session?.status ?? null}
          onNewConversation={() => restartSession('new')}
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
      <div className="agent-console__terminal-shell" role="region" aria-label="Codex CLI 会话">
        {currentWorkspaceKey ? (
          <AgentTerminalSurface
            activeOutput={activeOutput}
            terminalElementRef={terminalElementRef}
            onFallbackInput={writeAgentInput}
            session={session}
            useFallback={isTestRuntime()}
          />
        ) : (
          <div className="agent-console__empty">未选择工作区</div>
        )}
      </div>
    </div>
  )
}
