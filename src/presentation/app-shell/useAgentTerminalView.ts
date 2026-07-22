import { useEffect, type MutableRefObject } from 'react'

import type { AgentSessionSnapshot } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import { createTerminalXtermSurface } from './terminalXtermSurface'
import type { AgentTerminalMeasurement } from './agentConsoleModel'
import type { TerminalDimensions } from './types'
import { useTerminalSurfaceRegistry } from './useTerminalSurfaceRegistry'

export function useAgentTerminalView({
  dimensionsRef,
  enabled,
  session,
  terminalElementRef,
  workspaceKey,
  onDimensionsChange
}: {
  readonly dimensionsRef: MutableRefObject<AgentTerminalMeasurement | null>
  readonly enabled: boolean
  readonly session: AgentSessionSnapshot | null
  readonly terminalElementRef: MutableRefObject<HTMLDivElement | null>
  readonly workspaceKey: string | null
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
}): void {
  const surfaceRegistry = useTerminalSurfaceRegistry()
  const identity = session?.terminalViewIdentity
  const identityKey = identity
    ? [identity.sessionId, identity.runId, identity.generation].join('\0')
    : null

  useEffect(() => {
    const element = terminalElementRef.current
    const api = window.cleancode
    if (!enabled || !element || !workspaceKey) {
      return undefined
    }

    if (!identity || !session) {
      const measurementSurface = createTerminalXtermSurface()
      measurementSurface.attach({
        element,
        isResizeSuspended: false,
        onDimensionsChange: (dimensions) => {
          dimensionsRef.current = { dimensions, workspaceKey }
          onDimensionsChange(dimensions)
        },
        onInput: () => undefined,
        onOpenLink: () => undefined,
        onOpenSearch: () => undefined,
        onRestoreRequired: () => undefined,
        onSearchResultsChange: () => undefined
      })
      return () => {
        measurementSurface.detach(element)
        measurementSurface.dispose()
      }
    }

    if (!surfaceRegistry || !api?.attachTerminalView) return undefined

    const lease = surfaceRegistry.create(identity, () =>
      createTerminalXtermSurface(session.terminalSourceTheme)
    )
    const surface = lease.surface
    let isReleased = false
    let restoreTail = Promise.resolve()
    const requestRestore = (attempt: number): void => {
      restoreTail = restoreTail
        .catch(() => undefined)
        .then(async () => {
          if (isReleased) return
          const snapshot = await api.attachTerminalView({ ...identity, viewId: lease.viewId })
          if (isReleased || snapshot.restoreMarker.viewId !== lease.viewId) return
          const result = await surface.restore(snapshot)
          if (result === 'retry' && attempt < 1) requestRestore(attempt + 1)
        })
      void restoreTail.catch(() => undefined)
    }

    surface.attach({
      element,
      isResizeSuspended: false,
      onDimensionsChange: (dimensions) => {
        dimensionsRef.current = { dimensions, workspaceKey }
        onDimensionsChange(dimensions)
        void api.resizeAgentSession({ ...dimensions, sessionId: session.sessionId })
      },
      onInput: (input) => {
        void api.writeAgentSession({ input, sessionId: session.sessionId })
      },
      onOpenLink: () => undefined,
      onOpenSearch: () => undefined,
      onRestoreRequired: () => requestRestore(0),
      onSearchResultsChange: () => undefined
    })
    requestRestore(0)

    return () => {
      isReleased = true
      surface.detach(element)
      void api
        .detachTerminalView?.({ ...identity, viewId: lease.viewId })
        .catch(() => undefined)
        .finally(() => surfaceRegistry.release(lease.viewId))
    }
  }, [
    dimensionsRef,
    enabled,
    identityKey,
    onDimensionsChange,
    session,
    surfaceRegistry,
    terminalElementRef,
    workspaceKey
  ])
}
