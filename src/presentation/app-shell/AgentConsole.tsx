import type { Terminal as XTerm } from '@xterm/xterm'
import { ShieldAlert } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject
} from 'react'

import type {
  AgentPtyOutputEvent,
  AgentSessionSnapshot,
  AgentToolApprovalRequest
} from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import {
  defaultAgentLayoutPosition,
  defaultAgentLayoutSize
} from '../../contexts/agent/domain/aggregates/AgentSession'
import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { defaultAgentXtermDimensions, installAgentXterm } from './agentTerminalXterm'
import { AgentConsoleActions } from './AgentConsoleActions'
import { appendTerminalOutputTail } from './terminalOutputTail'
import { CodexCliStatusView, type CodexCliPanelState } from './CodexCliStatusView'
import type { TerminalDimensions, WorkbenchSnapshot } from './types'

interface AgentTerminalMeasurement {
  readonly dimensions: TerminalDimensions
  readonly workspaceKey: string
}

interface AgentSessionBinding {
  readonly session: AgentSessionSnapshot
  readonly workspaceKey: string
}

interface AgentConsoleProps {
  readonly agent?: WorkspaceAgentSnapshot
  readonly currentWorkbench?: WorkbenchSnapshot | null
  readonly currentWorkspace?: WorkbenchSnapshot['project']['workspaces'][number] | null
  readonly onGraphUpdated?: (graph: BlockGraphSnapshot) => void
  readonly onRemove?: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRename?: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  readonly onSelect?: () => void
}

export function AgentConsole({
  agent,
  currentWorkbench = null,
  currentWorkspace = null,
  onGraphUpdated,
  onRemove,
  onRename,
  onSelect
}: AgentConsoleProps) {
  const activeAgent = agent ?? createFallbackAgent(currentWorkbench, currentWorkspace)
  const [codexCliState, setCodexCliState] = useState<CodexCliPanelState>(() =>
    window.cleancode ? { status: 'checking' } : { status: 'unavailable' }
  )
  const [session, setSession] = useState<AgentSessionSnapshot | null>(null)
  const [activeOutput, setActiveOutput] = useState('')
  const [attachAttempt, setAttachAttempt] = useState(0)
  const [pendingApprovals, setPendingApprovals] = useState<AgentToolApprovalRequest[]>([])
  const [measuredTerminalKey, setMeasuredTerminalKey] = useState<string | null>(null)
  const currentWorkspaceKey = createWorkspaceKey(
    currentWorkbench,
    currentWorkspace,
    activeAgent.agentId
  )
  const currentProjectDirectory = currentWorkbench?.project.directory ?? null
  const currentWorkspaceName = currentWorkspace?.name ?? null
  const activeSessionId = session?.sessionId
  const activeOutputRef = useRef(activeOutput)
  const dimensionsRef = useRef<AgentTerminalMeasurement | null>(null)
  const outputBySessionRef = useRef(new Map<string, string>())
  const restartRequestRef = useRef<{
    readonly mode: 'new' | 'retry'
    readonly workspaceKey: string
  } | null>(null)
  const sessionBindingRef = useRef<AgentSessionBinding | null>(null)
  const sessionRef = useRef<AgentSessionSnapshot | null>(null)
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const writeAgentInput = useCallback((input: string) => {
    const activeSession = sessionRef.current

    if (!activeSession) {
      return
    }

    void window.cleancode?.writeAgentSession({
      input,
      sessionId: activeSession.sessionId
    })
  }, [])

  useLayoutEffect(() => {
    sessionRef.current = session
  }, [session])

  useLayoutEffect(() => {
    activeOutputRef.current = activeOutput
  }, [activeOutput])

  useEffect(() => {
    let isCurrent = true

    async function inspectCodexCli(): Promise<void> {
      const api = window.cleancode

      if (!api?.inspectCodexCli) {
        setCodexCliState({ status: 'unavailable' })
        return
      }

      setCodexCliState({ status: 'checking' })
      const installation = await api.inspectCodexCli()

      if (isCurrent) {
        setCodexCliState({ installation, status: 'ready' })
      }
    }

    void inspectCodexCli()

    return () => {
      isCurrent = false
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
        const nextOutput = appendAgentOutput(outputBySessionRef.current, event)

        if (event.sessionId === sessionRef.current?.sessionId) {
          setActiveOutput(nextOutput)
          xtermRef.current?.write(event.data)
        }
      }) ?? noop
    const unsubscribeExit =
      api.onAgentPtyExit?.((event) => {
        if (event.agentId && event.agentId !== activeAgent.agentId) return
        if (event.sessionId === sessionRef.current?.sessionId) {
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
    const unsubscribeApproval =
      api.onAgentToolApprovalRequested?.((approval) => {
        if (!approval.agentId || approval.agentId === activeAgent.agentId) {
          setPendingApprovals((approvals) => [...approvals, approval])
        }
      }) ?? noop

    return () => {
      unsubscribeOutput()
      unsubscribeExit()
      unsubscribeGraph()
      unsubscribeApproval()
    }
  }, [activeAgent.agentId, currentProjectDirectory, currentWorkspaceName, onGraphUpdated])

  useEffect(() => {
    let isCurrent = true

    async function attachSession(): Promise<void> {
      const api = window.cleancode

      if (!api?.attachAgentSession || !currentWorkbench || !currentWorkspace) {
        sessionBindingRef.current = null
        sessionRef.current = null
        setSession(null)
        setActiveOutput('')
        return
      }

      if (sessionBindingRef.current?.workspaceKey !== currentWorkspaceKey) {
        sessionBindingRef.current = null
        sessionRef.current = null
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
        workspaceDirectory: currentWorkspace.directory,
        workspaceName: currentWorkspace.name
      })

      if (!isCurrent) {
        return
      }

      if (restartMode) {
        restartRequestRef.current = null
      }
      sessionBindingRef.current = { session: nextSession, workspaceKey: currentWorkspaceKey }
      sessionRef.current = nextSession
      setSession(nextSession)
      const restoredOutput = outputBySessionRef.current.get(nextSession.sessionId) ?? ''
      setActiveOutput(restoredOutput)

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

    void attachSession()

    return () => {
      isCurrent = false
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
    if (!activeSessionId) {
      return
    }

    const restoredOutput = outputBySessionRef.current.get(activeSessionId) ?? ''

    setActiveOutput((currentOutput) =>
      currentOutput === restoredOutput ? currentOutput : restoredOutput
    )
    xtermRef.current?.reset()
    if (restoredOutput) {
      xtermRef.current?.write(restoredOutput)
    }
  }, [activeSessionId])

  useEffect(() => {
    if (isTestRuntime() || !terminalElementRef.current) {
      return undefined
    }

    return installAgentXterm({
      element: terminalElementRef.current,
      initialOutput: activeOutputRef.current,
      onDimensionsChange: (dimensions) => {
        if (!currentWorkspaceKey) return
        dimensionsRef.current = { dimensions, workspaceKey: currentWorkspaceKey }
        setMeasuredTerminalKey((currentKey) =>
          currentKey === currentWorkspaceKey ? currentKey : currentWorkspaceKey
        )
        const activeBinding = sessionBindingRef.current

        if (activeBinding?.workspaceKey === currentWorkspaceKey) {
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

  const activeApproval = pendingApprovals.find(
    (approval) =>
      (!approval.agentId || approval.agentId === activeAgent.agentId) &&
      approval.projectDirectory === currentWorkbench?.project.directory &&
      approval.workspaceName === currentWorkspace?.name
  )
  function restartSession(mode: 'new' | 'retry'): void {
    if (!currentWorkspaceKey) {
      return
    }

    restartRequestRef.current = { mode, workspaceKey: currentWorkspaceKey }
    setAttachAttempt((attempt) => attempt + 1)
  }

  async function approveApproval(approval: AgentToolApprovalRequest): Promise<void> {
    setPendingApprovals((approvals) =>
      approvals.filter((candidate) => candidate.approvalId !== approval.approvalId)
    )
    await window.cleancode?.approveAgentTool({ approvalId: approval.approvalId })
  }

  async function rejectApproval(approval: AgentToolApprovalRequest): Promise<void> {
    setPendingApprovals((approvals) =>
      approvals.filter((candidate) => candidate.approvalId !== approval.approvalId)
    )
    await window.cleancode?.rejectAgentTool({ approvalId: approval.approvalId })
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
      {activeApproval ? (
        <div className="agent-approval" role="group" aria-label="Agent 工具授权">
          <ShieldAlert size={16} aria-hidden="true" />
          <div className="agent-approval__copy">
            <strong>需要授权</strong>
            <span>{activeApproval.summary}</span>
          </div>
          <div className="agent-approval__actions">
            <button type="button" onClick={() => void approveApproval(activeApproval)}>
              确认删除
            </button>
            <button type="button" onClick={() => void rejectApproval(activeApproval)}>
              拒绝
            </button>
          </div>
        </div>
      ) : null}
      <div className="agent-console__terminal-shell" role="region" aria-label="Codex CLI 会话">
        {currentWorkspaceKey ? (
          <AgentTerminalSurface
            activeOutput={activeOutput}
            terminalElementRef={terminalElementRef}
            onFallbackInput={writeAgentInput}
          />
        ) : (
          <div className="agent-console__empty">未选择工作区</div>
        )}
      </div>
    </div>
  )
}

function AgentTerminalSurface({
  activeOutput,
  terminalElementRef,
  onFallbackInput
}: {
  readonly activeOutput: string
  readonly terminalElementRef: MutableRefObject<HTMLDivElement | null>
  readonly onFallbackInput: (input: string) => void
}) {
  if (isTestRuntime()) {
    return (
      <div className="agent-terminal-fallback">
        <pre aria-label="Codex CLI 终端">{activeOutput}</pre>
        <textarea
          aria-label="Codex CLI 输入"
          onChange={(event) => {
            onFallbackInput(event.target.value)
            event.target.value = ''
          }}
        />
      </div>
    )
  }

  return (
    <div className="agent-terminal-frame">
      <div className="agent-terminal-viewport" ref={terminalElementRef} />
    </div>
  )
}

function appendAgentOutput(
  outputBySession: Map<string, string>,
  event: AgentPtyOutputEvent
): string {
  const nextOutput = appendTerminalOutputTail(
    outputBySession.get(event.sessionId) ?? '',
    event.data
  )

  outputBySession.set(event.sessionId, nextOutput)
  return nextOutput
}

function createWorkspaceKey(
  workbench: WorkbenchSnapshot | null,
  workspace: WorkbenchSnapshot['project']['workspaces'][number] | null,
  agentId: string
): string | null {
  return workbench && workspace
    ? `${workbench.project.id}\0${workspace.name}\0${workspace.gitBranch ?? ''}\0${agentId}`
    : null
}

function createFallbackAgent(
  workbench: WorkbenchSnapshot | null,
  workspace: WorkbenchSnapshot['project']['workspaces'][number] | null
): WorkspaceAgentSnapshot {
  return {
    agentId: 'default-agent',
    layout: { position: defaultAgentLayoutPosition, size: defaultAgentLayoutSize },
    name: 'Agent 1',
    projectId: workbench?.project.id ?? 'unselected-project',
    workspaceName: workspace?.name ?? 'unselected-workspace'
  }
}

function isTestRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}

function noop(): void {
  return undefined
}

function haveSameDimensions(left: TerminalDimensions, right: TerminalDimensions): boolean {
  return left.columns === right.columns && left.rows === right.rows
}
