import { useCallback, useEffect, useLayoutEffect, useRef, type FocusEvent } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalSnapshot } from '../../contexts/run/application/dto/TerminalModelSnapshot'
import { appendTerminalOutputTail } from './terminalOutputTail'
import { useTerminalSurfaceRegistry } from './useTerminalSurfaceRegistry'
import { createTerminalSurfaceKey, type TerminalSurface } from './terminalSurfaceRegistry'
import { createTerminalXtermSurface } from './terminalXtermSurface'
import type { TerminalDimensions, TerminalViewState } from './types'
import { useI18n } from './i18n/useI18n'

interface TerminalViewportProps {
  readonly block: TerminalBlockSnapshot
  readonly session: TerminalViewState
  readonly focusRequestId: number
  readonly isResizeSuspended?: boolean
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (block: TerminalBlockSnapshot, input: string) => void
}

export function TerminalViewport({
  block,
  session,
  focusRequestId,
  isResizeSuspended = false,
  onDimensionsChange,
  onInput
}: TerminalViewportProps) {
  const { t } = useI18n()
  const surfaceRegistry = useTerminalSurfaceRegistry()
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  const outputTailElementRef = useRef<HTMLPreElement | null>(null)
  const surfaceRef = useRef<TerminalSurface | null>(null)
  const outputTailRef = useRef(appendTerminalOutputTail('', session.output))
  const blockRef = useRef(block)
  const runIdentityRef = useRef(session.runIdentity ?? null)
  const onDimensionsChangeRef = useRef(onDimensionsChange)
  const onInputRef = useRef(onInput)
  const isResizeSuspendedRef = useRef(isResizeSuspended)
  const surfaceIdentityKey = session.runIdentity
    ? createTerminalSurfaceKey(session.runIdentity)
    : null

  useLayoutEffect(() => {
    blockRef.current = block
    runIdentityRef.current = session.runIdentity ?? null
    onInputRef.current = onInput
    onDimensionsChangeRef.current = onDimensionsChange
    isResizeSuspendedRef.current = isResizeSuspended
  }, [block, isResizeSuspended, onDimensionsChange, onInput, session])

  useEffect(() => {
    outputTailRef.current = appendTerminalOutputTail('', session.output)

    if (outputTailElementRef.current) {
      outputTailElementRef.current.textContent = outputTailRef.current
    }
  }, [session.output])

  useEffect(() => surfaceRef.current?.setResizeSuspended(isResizeSuspended), [isResizeSuspended])

  useEffect(() => {
    if (outputTailElementRef.current) {
      outputTailElementRef.current.textContent = outputTailRef.current
    }
  })

  const focusTerminal = useCallback(() => {
    surfaceRef.current?.focus()
  }, [])
  const focusTerminalFromViewportFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      if (event.target === terminalElementRef.current) {
        focusTerminal()
      }
    },
    [focusTerminal]
  )

  useEffect(() => {
    if (isTestRuntime() || !terminalElementRef.current) {
      return undefined
    }

    const element = terminalElementRef.current
    const runIdentity = runIdentityRef.current
    const lease =
      runIdentity && surfaceRegistry
        ? surfaceRegistry.create(runIdentity, createTerminalXtermSurface)
        : null
    const surface = lease?.surface ?? createTerminalXtermSurface()
    const api = window.cleancode
    let isReleased = false
    let restoreTail = Promise.resolve()

    surfaceRef.current = surface
    surface.attach({
      element,
      isResizeSuspended: isResizeSuspendedRef.current,
      onDimensionsChange: (dimensions) => onDimensionsChangeRef.current(dimensions),
      onInput: (input) => onInputRef.current(blockRef.current, input),
      onRestoreRequired: () => requestRestore(0)
    })

    const requestRestore = (attempt: number): void => {
      restoreTail = restoreTail
        .catch(() => undefined)
        .then(async () => {
          if (isReleased) return
          const snapshot =
            runIdentity && lease && api?.attachTerminalView
              ? await api.attachTerminalView({ ...runIdentity, viewId: lease.viewId })
              : createFallbackSnapshot(runIdentity, outputTailRef.current)
          if (isReleased) return
          if (lease && api?.attachTerminalView && snapshot.restoreMarker.viewId !== lease.viewId) {
            return
          }
          const result = await surface.restore(snapshot)
          if (isReleased) return
          outputTailRef.current = appendTerminalOutputTail('', snapshot.transcript)
          if (outputTailElementRef.current) {
            outputTailElementRef.current.textContent = outputTailRef.current
          }
          if (result === 'retry' && attempt < 1) requestRestore(attempt + 1)
        })
      void restoreTail.catch(() => undefined)
    }

    requestRestore(0)

    return () => {
      isReleased = true
      surface.detach(element)
      if (runIdentity && lease && api?.detachTerminalView) {
        void api
          .detachTerminalView({ ...runIdentity, viewId: lease.viewId })
          .catch(() => undefined)
          .finally(() => surfaceRegistry?.release(lease.viewId))
      } else if (lease) surfaceRegistry?.release(lease.viewId)
      else surface.dispose()
      if (surfaceRef.current === surface) {
        surfaceRef.current = null
      }
    }
  }, [surfaceIdentityKey, surfaceRegistry])

  useEffect(() => {
    if (focusRequestId > 0) {
      focusTerminal()
    }
  }, [focusRequestId, focusTerminal])

  if (isTestRuntime()) {
    return (
      <pre
        className="terminal-fallback"
        ref={outputTailElementRef}
        aria-label={t('terminal.output', { blockName: block.name })}
        data-terminal-session-id={session.sessionId ?? ''}
      />
    )
  }

  return (
    <div
      className="terminal-output-shell nodrag nopan nowheel"
      onPointerDownCapture={focusTerminal}
    >
      <div
        className="terminal-viewport nodrag nopan nowheel"
        ref={terminalElementRef}
        tabIndex={0}
        onFocus={focusTerminalFromViewportFocus}
      />
      <pre
        className="terminal-output-tail"
        ref={outputTailElementRef}
        aria-label={t('terminal.output', { blockName: block.name })}
        data-terminal-output-tail="true"
        data-terminal-session-id={session.sessionId ?? ''}
      />
    </div>
  )
}

function isTestRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}

function createFallbackSnapshot(
  identity: NonNullable<TerminalViewState['runIdentity']> | null,
  output: string
): TerminalSnapshot {
  return {
    identity: identity
      ? {
          ...identity,
          projectDirectory: '',
          workspaceDirectory: '',
          gitBranch: null
        }
      : ({
          projectId: '',
          projectDirectory: '',
          workspaceName: '',
          workspaceDirectory: '',
          gitBranch: null,
          blockId: '',
          sessionId: '',
          runId: '',
          generation: 0
        } satisfies TerminalSnapshot['identity']),
    sequence: 0,
    restoreMarker: { viewId: '', sequence: 0 },
    content: output,
    transcript: output,
    dimensions: { columns: 80, rows: 24 },
    title: '',
    workingDirectory: '',
    modes: {
      applicationCursorKeysMode: false,
      applicationKeypadMode: false,
      bracketedPasteMode: false,
      insertMode: false,
      mouseTrackingMode: 'none',
      originMode: false,
      reverseWraparoundMode: false,
      sendFocusMode: false,
      synchronizedOutputMode: false,
      wraparoundMode: true
    }
  }
}
