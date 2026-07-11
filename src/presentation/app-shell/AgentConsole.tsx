import type { Terminal as XTerm } from '@xterm/xterm'
import { Bot, ShieldAlert } from 'lucide-react'
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
import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { defaultAgentXtermDimensions, installAgentXterm } from './agentTerminalXterm'
import { appendTerminalOutputTail } from './terminalOutputTail'
import { CodexCliStatusView, type CodexCliPanelState } from './CodexCliStatusView'
import type { WorkbenchSnapshot } from './types'

interface AgentConsoleProps {
  readonly currentWorkbench?: WorkbenchSnapshot | null
  readonly currentWorkspace?: WorkbenchSnapshot['project']['workspaces'][number] | null
  readonly onGraphUpdated?: (graph: BlockGraphSnapshot) => void
}

export function AgentConsole({
  currentWorkbench = null,
  currentWorkspace = null,
  onGraphUpdated
}: AgentConsoleProps) {
  const [codexCliState, setCodexCliState] = useState<CodexCliPanelState>(() =>
    window.cleancode ? { status: 'checking' } : { status: 'unavailable' }
  )
  const [session, setSession] = useState<AgentSessionSnapshot | null>(null)
  const [activeOutput, setActiveOutput] = useState('')
  const [attachAttempt, setAttachAttempt] = useState(0)
  const [pendingApprovals, setPendingApprovals] = useState<AgentToolApprovalRequest[]>([])
  const currentWorkspaceKey = createWorkspaceKey(currentWorkbench, currentWorkspace)
  const currentProjectDirectory = currentWorkbench?.project.directory ?? null
  const currentWorkspaceName = currentWorkspace?.name ?? null
  const activeSessionId = session?.sessionId
  const activeOutputRef = useRef(activeOutput)
  const dimensionsRef = useRef(defaultAgentXtermDimensions)
  const outputBySessionRef = useRef(new Map<string, string>())
  const restartRequestRef = useRef<{
    readonly mode: 'new' | 'retry'
    readonly workspaceKey: string
  } | null>(null)
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
        const nextOutput = appendAgentOutput(outputBySessionRef.current, event)

        if (event.sessionId === sessionRef.current?.sessionId) {
          setActiveOutput(nextOutput)
          xtermRef.current?.write(event.data)
        }
      }) ?? noop
    const unsubscribeExit =
      api.onAgentPtyExit?.((event) => {
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
          currentProjectDirectory === event.projectDirectory &&
          currentWorkspaceName === event.workspaceName
        ) {
          onGraphUpdated?.(event.graph)
        }
      }) ?? noop
    const unsubscribeApproval =
      api.onAgentToolApprovalRequested?.((approval) => {
        setPendingApprovals((approvals) => [...approvals, approval])
      }) ?? noop

    return () => {
      unsubscribeOutput()
      unsubscribeExit()
      unsubscribeGraph()
      unsubscribeApproval()
    }
  }, [currentProjectDirectory, currentWorkspaceName, onGraphUpdated])

  useEffect(() => {
    let isCurrent = true

    async function attachSession(): Promise<void> {
      const api = window.cleancode

      if (!api?.attachAgentSession || !currentWorkbench || !currentWorkspace) {
        setSession(null)
        setActiveOutput('')
        return
      }

      const restartRequest = restartRequestRef.current
      const restartMode =
        restartRequest?.workspaceKey === currentWorkspaceKey ? restartRequest.mode : undefined
      const nextSession = await api.attachAgentSession({
        columns: dimensionsRef.current.columns,
        gitBranch: currentWorkspace.gitBranch,
        persistenceMode:
          currentWorkspace.gitBranch || currentWorkbench.gitBranches.length === 0
            ? 'persistent'
            : 'ephemeral',
        projectDirectory: currentWorkbench.project.directory,
        projectId: currentWorkbench.project.id,
        restartMode,
        rows: dimensionsRef.current.rows,
        workspaceDirectory: currentWorkspace.directory,
        workspaceName: currentWorkspace.name
      })

      if (!isCurrent) {
        return
      }

      if (restartMode) {
        restartRequestRef.current = null
      }
      setSession(nextSession)
      const restoredOutput = outputBySessionRef.current.get(nextSession.sessionId) ?? ''
      setActiveOutput(restoredOutput)
    }

    void attachSession()

    return () => {
      isCurrent = false
    }
  }, [attachAttempt, currentWorkbench, currentWorkspace, currentWorkspaceKey])

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
        dimensionsRef.current = dimensions
        const activeSession = sessionRef.current

        if (activeSession) {
          void window.cleancode?.resizeAgentSession({
            ...dimensions,
            sessionId: activeSession.sessionId
          })
        }
      },
      onInput: writeAgentInput,
      xtermRef
    })
  }, [currentWorkspaceKey, writeAgentInput])

  const activeApproval = pendingApprovals.find(
    (approval) =>
      approval.projectDirectory === currentWorkbench?.project.directory &&
      approval.workspaceName === currentWorkspace?.name
  )
  const workspaceLabel = resolveWorkspaceLabel(currentWorkbench, currentWorkspace)

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
      <div className="agent-console__header">
        <div className="agent-console__title-row">
          <div className="agent-console__identity">
            <span className="agent-console__icon">
              <Bot size={17} aria-hidden="true" />
            </span>
            <div className="agent-console__heading">
              <strong>Codex CLI</strong>
              <span title={workspaceLabel}>{workspaceLabel}</span>
            </div>
          </div>
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

  return <div className="agent-terminal-viewport" ref={terminalElementRef} />
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

function resolveWorkspaceLabel(
  workbench: WorkbenchSnapshot | null,
  workspace: WorkbenchSnapshot['project']['workspaces'][number] | null
): string {
  if (!workbench || !workspace) {
    return '未选择工作区'
  }

  return `${workbench.project.name} / ${workspace.name} · ${workspace.gitBranch ?? '无分支'}`
}

function createWorkspaceKey(
  workbench: WorkbenchSnapshot | null,
  workspace: WorkbenchSnapshot['project']['workspaces'][number] | null
): string | null {
  return workbench && workspace
    ? `${workbench.project.id}\0${workspace.name}\0${workspace.gitBranch ?? ''}`
    : null
}

function isTestRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}

function noop(): void {
  return undefined
}
