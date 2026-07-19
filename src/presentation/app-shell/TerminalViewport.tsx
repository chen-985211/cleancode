import { useCallback, useEffect, useLayoutEffect, useRef, type FocusEvent } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
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
    const isPersistent = Boolean(runIdentity && surfaceRegistry)
    const surface =
      runIdentity && surfaceRegistry
        ? surfaceRegistry.acquire(runIdentity, () =>
            createTerminalXtermSurface(outputTailRef.current)
          )
        : createTerminalXtermSurface(outputTailRef.current)

    surfaceRef.current = surface
    surface.attach({
      element,
      isResizeSuspended: isResizeSuspendedRef.current,
      onDimensionsChange: (dimensions) => onDimensionsChangeRef.current(dimensions),
      onInput: (input) => onInputRef.current(blockRef.current, input)
    })

    return () => {
      surface.detach(element)
      if (!isPersistent) {
        surface.dispose()
      }
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
