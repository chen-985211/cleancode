import { useEffect, useRef, type MutableRefObject } from 'react'

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
  const identity = session?.runtime.terminal.viewIdentity
  const runtimeSessionId = session?.sessionId ?? null
  const terminalSourceTheme = session?.terminalSourceTheme
  const onDimensionsChangeRef = useRef(onDimensionsChange)
  onDimensionsChangeRef.current = onDimensionsChange
  const identityKey = identity
    ? [identity.sessionId, identity.runId, identity.generation].join('\0')
    : null

  useEffect(() => {
    const element = terminalElementRef.current
    const api = window.cleancode
    if (!enabled || !element || !workspaceKey) {
      return undefined
    }

    if (!identity || !runtimeSessionId) {
      const measurementSurface = createTerminalXtermSurface()
      measurementSurface.attach({
        element,
        isResizeSuspended: false,
        onDimensionsChange: (dimensions) => {
          dimensionsRef.current = { dimensions, workspaceKey }
          onDimensionsChangeRef.current(dimensions)
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
      createTerminalXtermSurface(terminalSourceTheme)
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
        onDimensionsChangeRef.current(dimensions)
        void api.resizeAgentSession({ ...dimensions, sessionId: runtimeSessionId })
      },
      onInput: (input) => {
        void api.writeAgentSession({ input, sessionId: runtimeSessionId })
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
    runtimeSessionId,
    surfaceRegistry,
    terminalElementRef,
    terminalSourceTheme,
    workspaceKey
  ])
}
