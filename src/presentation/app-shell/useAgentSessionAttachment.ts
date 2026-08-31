import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject
} from 'react'

import type {
  AgentRuntimeChangedEvent,
  AgentSessionSnapshot
} from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type {
  AgentAttachMode,
  AgentAttachOperation
} from '../../contexts/agent/presentation/view-models/AgentAttachmentPresentation'
import {
  applyAgentRuntimeEvent,
  rememberLatestAgentRuntimeEvent
} from '../../contexts/agent/presentation/view-models/agentRuntimeReconciliation'
import type { AgentTerminalMeasurement } from './agentConsoleModel'
import { isTestRuntime } from './agentConsoleModel'
import { readTerminalSourceTheme } from './terminalTheme'
import { defaultTerminalDimensions, type WorkbenchSnapshot } from './types'

interface AgentSessionBinding {
  readonly agentName: string
  readonly session: AgentSessionSnapshot
  readonly workspaceKey: string
}

interface UseAgentSessionAttachmentInput {
  readonly activeAgent: WorkspaceAgentSnapshot
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | null
  readonly currentWorkspaceKey: string | null
  readonly dimensionsRef: MutableRefObject<AgentTerminalMeasurement | null>
  readonly measuredTerminalKey: string | null
}

export function useAgentSessionAttachment({
  activeAgent,
  currentWorkbench,
  currentWorkspace,
  currentWorkspaceKey,
  dimensionsRef,
  measuredTerminalKey
}: UseAgentSessionAttachmentInput) {
  const [attachAttempt, setAttachAttempt] = useState(0)
  const [operation, setOperationState] = useState<AgentAttachOperation>({ status: 'idle' })
  const [session, setSession] = useState<AgentSessionSnapshot | null>(null)
  const inFlightRef = useRef<{ readonly requestId: number; readonly workspaceKey: string } | null>(
    null
  )
  const isMountedRef = useRef(true)
  const metadataRequestSequenceRef = useRef(0)
  const operationRef = useRef<AgentAttachOperation>(operation)
  const pendingRuntimeEventsRef = useRef(new Map<string, AgentRuntimeChangedEvent>())
  const requestSequenceRef = useRef(0)
  const restartRequestRef = useRef<{
    readonly mode: AgentAttachMode
    readonly workspaceKey: string
  } | null>(null)
  const scopeGenerationRef = useRef(0)
  const sessionBindingRef = useRef<AgentSessionBinding | null>(null)

  const setOperation = useCallback((nextOperation: AgentAttachOperation) => {
    operationRef.current = nextOperation
    setOperationState(nextOperation)
  }, [])

  useLayoutEffect(() => {
    scopeGenerationRef.current += 1
    requestSequenceRef.current += 1
    metadataRequestSequenceRef.current += 1
    inFlightRef.current = null
    pendingRuntimeEventsRef.current.clear()
    restartRequestRef.current = null
    if (sessionBindingRef.current?.workspaceKey !== currentWorkspaceKey) {
      sessionBindingRef.current = null
      setSession(null)
    }
    setOperation(currentWorkspaceKey ? { status: 'measuring' } : { status: 'idle' })
  }, [currentWorkspaceKey, setOperation])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      requestSequenceRef.current += 1
      metadataRequestSequenceRef.current += 1
    }
  }, [])

  const projectDirectory = currentWorkbench?.project.directory ?? null
  const projectId = currentWorkbench?.project.id ?? null
  const workspaceDirectory = currentWorkspace?.directory ?? null
  const workspaceId = currentWorkspace?.workspaceId ?? null
  const gitBranch = currentWorkspace?.gitBranch ?? null
  const persistenceMode =
    currentWorkspace && currentWorkbench
      ? currentWorkspace.gitBranch || currentWorkbench.gitBranches.length === 0
        ? 'persistent'
        : 'ephemeral'
      : null

  useEffect(() => {
    const api = window.cleancode
    if (
      !api?.attachAgentSession ||
      !currentWorkspaceKey ||
      !projectDirectory ||
      !projectId ||
      !workspaceDirectory ||
      !workspaceId ||
      !persistenceMode
    ) {
      setOperation({ status: 'idle' })
      return undefined
    }
    if (!isTestRuntime() && measuredTerminalKey !== currentWorkspaceKey) {
      setOperation({ status: 'measuring' })
      return undefined
    }

    const restartRequest = restartRequestRef.current
    const mode =
      restartRequest?.workspaceKey === currentWorkspaceKey ? restartRequest.mode : 'initial'
    if (mode === 'initial' && sessionBindingRef.current?.workspaceKey === currentWorkspaceKey) {
      setOperation({ status: 'idle' })
      return undefined
    }
    if (inFlightRef.current?.workspaceKey === currentWorkspaceKey) return undefined

    restartRequestRef.current = null
    const requestId = ++requestSequenceRef.current
    inFlightRef.current = { requestId, workspaceKey: currentWorkspaceKey }
    setOperation({ mode, status: 'pending' })
    const measuredDimensions =
      dimensionsRef.current?.workspaceKey === currentWorkspaceKey
        ? dimensionsRef.current.dimensions
        : defaultTerminalDimensions

    void api
      .attachAgentSession({
        agentId: activeAgent.agentId,
        agentName: activeAgent.name,
        columns: measuredDimensions.columns,
        gitBranch,
        persistenceMode,
        projectDirectory,
        projectId,
        providerId: activeAgent.providerId,
        restartMode: mode === 'initial' ? undefined : mode,
        rows: measuredDimensions.rows,
        terminalSourceTheme: readTerminalSourceTheme(),
        workspaceDirectory,
        workspaceId
      })
      .then((nextSession) => {
        if (!isCurrentRequest(requestId, currentWorkspaceKey)) return
        const pendingRuntimeEvent = pendingRuntimeEventsRef.current.get(nextSession.sessionId)
        const committedSession = pendingRuntimeEvent
          ? applyAgentRuntimeEvent(nextSession, pendingRuntimeEvent)
          : nextSession
        pendingRuntimeEventsRef.current.delete(nextSession.sessionId)
        sessionBindingRef.current = {
          agentName: activeAgent.name,
          session: committedSession,
          workspaceKey: currentWorkspaceKey
        }
        setSession(committedSession)
        setOperation({ status: 'idle' })

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
      })
      .catch(() => {
        if (!isCurrentRequest(requestId, currentWorkspaceKey)) return
        setOperation({ mode, status: 'failed' })
      })
      .finally(() => {
        if (inFlightRef.current?.requestId === requestId) inFlightRef.current = null
      })

    return undefined

    function isCurrentRequest(candidateRequestId: number, candidateWorkspaceKey: string): boolean {
      return (
        isMountedRef.current &&
        requestSequenceRef.current === candidateRequestId &&
        currentWorkspaceKey === candidateWorkspaceKey
      )
    }
  }, [
    activeAgent.agentId,
    activeAgent.name,
    activeAgent.providerId,
    attachAttempt,
    currentWorkspaceKey,
    dimensionsRef,
    gitBranch,
    measuredTerminalKey,
    persistenceMode,
    projectDirectory,
    projectId,
    setOperation,
    workspaceDirectory,
    workspaceId
  ])

  useEffect(() => {
    const api = window.cleancode
    const activeBinding = sessionBindingRef.current
    if (
      !api?.updateAgentSessionMetadata ||
      !currentWorkspaceKey ||
      activeBinding?.workspaceKey !== currentWorkspaceKey ||
      activeBinding.agentName === activeAgent.name
    ) {
      return undefined
    }

    const requestId = ++metadataRequestSequenceRef.current
    const sessionId = activeBinding.session.sessionId
    void api
      .updateAgentSessionMetadata({
        agentId: activeAgent.agentId,
        agentName: activeAgent.name,
        sessionId
      })
      .then((accepted) => {
        if (
          !accepted ||
          !isMountedRef.current ||
          metadataRequestSequenceRef.current !== requestId
        ) {
          return
        }
        const currentBinding = sessionBindingRef.current
        if (
          currentBinding?.workspaceKey !== currentWorkspaceKey ||
          currentBinding.session.sessionId !== sessionId
        ) {
          return
        }
        sessionBindingRef.current = { ...currentBinding, agentName: activeAgent.name }
      })
      .catch(() => undefined)

    return undefined
  }, [activeAgent.agentId, activeAgent.name, currentWorkspaceKey, session?.sessionId])

  const requestAttach = useCallback(
    (mode: AgentAttachMode) => {
      if (!currentWorkspaceKey || operationRef.current.status === 'pending') return
      restartRequestRef.current = { mode, workspaceKey: currentWorkspaceKey }
      setOperation({ mode, status: 'pending' })
      setAttachAttempt((attempt) => attempt + 1)
    },
    [currentWorkspaceKey, setOperation]
  )

  const retryAttachment = useCallback(() => {
    const currentOperation = operationRef.current
    requestAttach(currentOperation.status === 'failed' ? currentOperation.mode : 'initial')
  }, [requestAttach])

  const applyRuntimeChange = useCallback((event: AgentRuntimeChangedEvent) => {
    const activeBinding = sessionBindingRef.current
    if (activeBinding?.session.sessionId !== event.sessionId) {
      rememberLatestAgentRuntimeEvent(pendingRuntimeEventsRef.current, event)
      return
    }
    const nextSession = applyAgentRuntimeEvent(activeBinding.session, event)
    if (nextSession === activeBinding.session) return
    sessionBindingRef.current = { ...activeBinding, session: nextSession }
    setSession(nextSession)
  }, [])

  const replaceSession = useCallback(
    (nextSession: AgentSessionSnapshot) => {
      if (!currentWorkspaceKey) return
      const pendingRuntimeEvent = pendingRuntimeEventsRef.current.get(nextSession.sessionId)
      const committedSession = pendingRuntimeEvent
        ? applyAgentRuntimeEvent(nextSession, pendingRuntimeEvent)
        : nextSession
      pendingRuntimeEventsRef.current.delete(nextSession.sessionId)
      sessionBindingRef.current = {
        agentName: activeAgent.name,
        session: committedSession,
        workspaceKey: currentWorkspaceKey
      }
      setSession(committedSession)
      setOperation({ status: 'idle' })
    },
    [activeAgent.name, currentWorkspaceKey, setOperation]
  )

  const writeInput = useCallback((input: string) => {
    const activeBinding = sessionBindingRef.current
    if (!activeBinding) return
    void window.cleancode?.writeAgentSession({
      input,
      sessionId: activeBinding.session.sessionId
    })
  }, [])

  return {
    applyRuntimeChange,
    operation,
    replaceSession,
    requestRestart: requestAttach,
    retryAttachment,
    scopeGenerationRef,
    session,
    writeInput
  }
}

function haveSameDimensions(
  left: AgentTerminalMeasurement['dimensions'],
  right: AgentTerminalMeasurement['dimensions']
): boolean {
  return left.columns === right.columns && left.rows === right.rows
}
