import { useEffect, useRef, type MutableRefObject } from 'react'

import type { AgentSessionSnapshot } from '../../../contexts/agent/application/dto/AgentSessionProtocol'
import { bindTerminalSurfaceAttachmentIdentity } from '../../../contexts/run/presentation/terminal-surface/terminalSurfaceAttachmentIdentity'
import {
  attachTerminalViewWithRetry,
  restoreTerminalViewWithRetry
} from '../../../contexts/run/presentation/terminal-surface/terminalViewAttachment'
import { createTerminalXtermSurface } from '../../../contexts/run/presentation/terminal-surface/terminalXtermSurface'
import { useTerminalSurfaceRegistry } from '../../../contexts/run/presentation/terminal-surface/useTerminalSurfaceRegistry'
import type { AgentTerminalMeasurement } from '../workbench/nodes/agent/agentConsoleModel'
import type { TerminalDimensions } from '../../../contexts/run/presentation/view-models/TerminalPresentationTypes'

const terminalInputBatchWindowMs = 16

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
      const releaseAttachmentIdentity = bindTerminalSurfaceAttachmentIdentity(element, null)
      return () => {
        releaseAttachmentIdentity()
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
    let pendingInput = ''
    let inputTimer: number | null = null
    let inputWriteTail = Promise.resolve()
    const flushInput = (): void => {
      inputTimer = null
      const input = pendingInput
      pendingInput = ''
      if (!input || isReleased) return
      inputWriteTail = inputWriteTail
        .catch(() => undefined)
        .then(() => {
          if (!isReleased) {
            return api.writeAgentSession({ input, sessionId: runtimeSessionId })
          }
        })
        .catch(() => undefined)
    }
    const enqueueInput = (input: string): void => {
      pendingInput += input
      inputTimer ??= window.setTimeout(flushInput, terminalInputBatchWindowMs)
    }
    const requestRestore = (): void => {
      restoreTail = restoreTail
        .catch(() => undefined)
        .then(async () => {
          if (isReleased) return
          await restoreTerminalViewWithRetry({
            isCancelled: () => isReleased,
            loadSnapshot: async () => {
              const snapshot = await attachTerminalViewWithRetry({
                attach: () => api.attachTerminalView({ ...identity, viewId: lease.viewId }),
                isCancelled: () => isReleased
              })
              return snapshot?.restoreMarker.viewId === lease.viewId ? snapshot : null
            },
            restore: (snapshot) => surface.restore(snapshot)
          })
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
      onInput: enqueueInput,
      onOpenLink: (rawTarget) => {
        if (isReleased || !api.openTerminalLink) return
        void api
          .openTerminalLink({ ...identity, viewId: lease.viewId, rawTarget })
          .catch(() => undefined)
      },
      onOpenSearch: () => undefined,
      onRestoreRequired: requestRestore,
      onSearchResultsChange: () => undefined
    })
    const releaseAttachmentIdentity = bindTerminalSurfaceAttachmentIdentity(
      element,
      identity.sessionId
    )
    requestRestore()

    return () => {
      isReleased = true
      if (inputTimer !== null) window.clearTimeout(inputTimer)
      pendingInput = ''
      releaseAttachmentIdentity()
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
