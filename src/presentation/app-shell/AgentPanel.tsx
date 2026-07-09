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

interface AgentPanelProps {
  readonly currentWorkbench?: WorkbenchSnapshot | null
  readonly currentWorkspace?: WorkbenchSnapshot['project']['workspaces'][number] | null
  readonly onGraphUpdated?: (graph: BlockGraphSnapshot) => void
}

export function AgentPanel({
  currentWorkbench = null,
  currentWorkspace = null,
  onGraphUpdated
}: AgentPanelProps) {
  const [codexCliState, setCodexCliState] = useState<CodexCliPanelState>(() =>
    window.cleancode ? { status: 'checking' } : { status: 'unavailable' }
  )
  const [session, setSession] = useState<AgentSessionSnapshot | null>(null)
  const [activeOutput, setActiveOutput] = useState('')
  const [pendingApprovals, setPendingApprovals] = useState<AgentToolApprovalRequest[]>([])
  const currentWorkspaceKey = createWorkspaceKey(currentWorkbench, currentWorkspace)
  const activeSessionId = session?.sessionId
  const activeOutputRef = useRef(activeOutput)
  const dimensionsRef = useRef(defaultAgentXtermDimensions)
  const outputBySessionRef = useRef(new Map<string, string>())
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

    if (!api) {
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
          currentWorkbench?.project.directory === event.projectDirectory &&
          currentWorkspace?.name === event.workspaceName
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
  }, [currentWorkbench?.project.directory, currentWorkspace?.name, onGraphUpdated])

  useEffect(() => {
    let isCurrent = true

    async function attachSession(): Promise<void> {
      const api = window.cleancode

      if (!api?.attachAgentSession || !currentWorkbench || !currentWorkspace) {
        setSession(null)
        setActiveOutput('')
        return
      }

      const nextSession = await api.attachAgentSession({
        columns: dimensionsRef.current.columns,
        projectDirectory: currentWorkbench.project.directory,
        rows: dimensionsRef.current.rows,
        workspaceDirectory: currentWorkspace.directory,
        workspaceName: currentWorkspace.name
      })

      if (!isCurrent) {
        return
      }

      setSession(nextSession)
      const restoredOutput = outputBySessionRef.current.get(nextSession.sessionId) ?? ''
      setActiveOutput(restoredOutput)
    }

    void attachSession()

    return () => {
      isCurrent = false
    }
  }, [currentWorkbench, currentWorkspace])

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
    <aside className="agent-panel" aria-label="Agent 面板">
      <div className="agent-panel__header">
        <div className="agent-panel__title-row">
          <div className="agent-panel__identity">
            <span className="agent-panel__icon">
              <Bot size={17} aria-hidden="true" />
            </span>
            <div className="agent-panel__heading">
              <strong>Codex CLI</strong>
              <span>{resolveWorkspaceLabel(currentWorkbench, currentWorkspace)}</span>
            </div>
          </div>
          <span className="agent-panel__status">
            <span className="status-dot" />
            {resolveStatusLabel(codexCliState, session)}
          </span>
        </div>
        <CodexCliStatusView state={codexCliState} />
      </div>
      {activeApproval ? (
        <div className="agent-approval" role="group" aria-label="Agent 工具授权">
          <ShieldAlert size={16} aria-hidden="true" />
          <div className="agent-approval__copy">
            <strong>需要授权</strong>
            <span>{activeApproval.summary}</span>
          </div>
          <button type="button" onClick={() => void approveApproval(activeApproval)}>
            确认删除
          </button>
          <button type="button" onClick={() => void rejectApproval(activeApproval)}>
            拒绝
          </button>
        </div>
      ) : null}
      <div className="agent-panel__terminal-shell">
        {currentWorkspaceKey ? (
          <AgentTerminalSurface
            activeOutput={activeOutput}
            terminalElementRef={terminalElementRef}
            onFallbackInput={writeAgentInput}
          />
        ) : (
          <div className="agent-panel__empty">未选择工作区</div>
        )}
      </div>
    </aside>
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

function resolveStatusLabel(
  state: CodexCliPanelState,
  session: AgentSessionSnapshot | null
): string {
  if (state.status === 'unavailable') {
    return '未接入'
  }

  if (state.status === 'checking') {
    return '检查中'
  }

  if (state.installation.status !== 'installed') {
    return '未安装'
  }

  return session?.status === 'running' ? '已连接' : '已安装'
}

function resolveWorkspaceLabel(
  workbench: WorkbenchSnapshot | null,
  workspace: WorkbenchSnapshot['project']['workspaces'][number] | null
): string {
  if (!workbench || !workspace) {
    return '未选择工作区'
  }

  return `${workbench.project.name} / ${workspace.name}`
}

function createWorkspaceKey(
  workbench: WorkbenchSnapshot | null,
  workspace: WorkbenchSnapshot['project']['workspaces'][number] | null
): string | null {
  return workbench && workspace ? `${workbench.project.directory}\0${workspace.name}` : null
}

function isTestRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}

function noop(): void {
  return undefined
}
