import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { AgentXtermSurface } from './agentTerminalXterm'
import type { AgentSessionBinding, AgentTerminalMeasurement } from './agentConsoleModel'
import { isTestRuntime } from './agentConsoleModel'
import type { AgentTerminalEventState } from './agentTerminalEventState'

export function useAgentTerminalSurface({
  agentId,
  dimensionsRef,
  events,
  projectId,
  sessionBindingRef,
  setMeasuredTerminalKey,
  terminalElementRef,
  workspaceKey,
  workspaceName,
  xtermRef
}: {
  readonly agentId: string
  readonly dimensionsRef: MutableRefObject<AgentTerminalMeasurement | null>
  readonly events: AgentTerminalEventState
  readonly projectId: string | null
  readonly sessionBindingRef: MutableRefObject<AgentSessionBinding | null>
  readonly setMeasuredTerminalKey: Dispatch<SetStateAction<string | null>>
  readonly terminalElementRef: MutableRefObject<HTMLDivElement | null>
  readonly workspaceKey: string | null
  readonly workspaceName: string | null
  readonly xtermRef: MutableRefObject<AgentXtermSurface | null>
}): void {
  useEffect(() => {
    const element = terminalElementRef.current
    if (isTestRuntime() || !element || !projectId || !workspaceKey || !workspaceName) {
      return undefined
    }

    const owner = { agentId, projectId, workspaceName }
    const surface = events.surfaceRegistry.acquire(owner)
    xtermRef.current = surface
    surface.attach({
      element,
      onDimensionsChange: (dimensions) => {
        dimensionsRef.current = { dimensions, workspaceKey }
        setMeasuredTerminalKey((currentKey) =>
          currentKey === workspaceKey ? currentKey : workspaceKey
        )
        const activeBinding = sessionBindingRef.current
        if (
          activeBinding?.workspaceKey === workspaceKey &&
          activeBinding.terminalController === surface
        ) {
          void window.cleancode?.resizeAgentSession({
            ...dimensions,
            sessionId: activeBinding.session.sessionId
          })
        }
      },
      onInput: (input) => {
        const activeBinding = sessionBindingRef.current
        if (!activeBinding || activeBinding.terminalController !== surface) return
        void window.cleancode?.writeAgentSession({
          input,
          sessionId: activeBinding.session.sessionId
        })
      }
    })

    return () => surface.detach(element)
  }, [
    agentId,
    dimensionsRef,
    events,
    projectId,
    sessionBindingRef,
    setMeasuredTerminalKey,
    terminalElementRef,
    workspaceKey,
    workspaceName,
    xtermRef
  ])
}
