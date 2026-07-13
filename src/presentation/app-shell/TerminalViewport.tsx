import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type MutableRefObject
} from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalOutputEvent } from '../../contexts/run/application/ports/TerminalProcessPort'
import { appendTerminalOutputTail } from './terminalOutputTail'
import { installTerminalSelectionCopy } from './terminalSelectionCopy'
import { readTerminalTheme, synchronizeTerminalTheme } from './terminalTheme'
import {
  terminalOutputBrowserEventName,
  type TerminalDimensions,
  type TerminalViewState
} from './types'

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
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  const outputTailElementRef = useRef<HTMLPreElement | null>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const outputTailRef = useRef(appendTerminalOutputTail('', session.output))
  const blockRef = useRef(block)
  const sessionRef = useRef(session)
  const onDimensionsChangeRef = useRef(onDimensionsChange)
  const onInputRef = useRef(onInput)
  const isResizeSuspendedRef = useRef(isResizeSuspended)
  const resumeResizeFitRef = useRef<() => void>(() => undefined)

  useLayoutEffect(() => {
    blockRef.current = block
    sessionRef.current = session
    onInputRef.current = onInput
    onDimensionsChangeRef.current = onDimensionsChange
  }, [block, onDimensionsChange, onInput, session])

  useEffect(() => {
    outputTailRef.current = appendTerminalOutputTail('', session.output)

    if (outputTailElementRef.current) {
      outputTailElementRef.current.textContent = outputTailRef.current
    }
  }, [session.output])

  useEffect(() => {
    const wasResizeSuspended = isResizeSuspendedRef.current

    isResizeSuspendedRef.current = isResizeSuspended

    if (wasResizeSuspended && !isResizeSuspended) {
      resumeResizeFitRef.current()
    }
  }, [isResizeSuspended])

  useEffect(() => {
    if (outputTailElementRef.current) {
      outputTailElementRef.current.textContent = outputTailRef.current
    }
  })

  useEffect(() => {
    const appendOutput = (output: string): void => {
      outputTailRef.current = appendTerminalOutputTail(outputTailRef.current, output)
      if (outputTailElementRef.current) {
        outputTailElementRef.current.textContent = outputTailRef.current
      }
      xtermRef.current?.write(output)
    }
    const handleTerminalOutput = (event: Event): void => {
      const outputEvent = (event as CustomEvent<TerminalOutputEvent>).detail
      if (outputEvent.sessionId === sessionRef.current.sessionId) {
        appendOutput(outputEvent.data)
      }
    }

    window.addEventListener(terminalOutputBrowserEventName, handleTerminalOutput)

    return () => window.removeEventListener(terminalOutputBrowserEventName, handleTerminalOutput)
  }, [])

  const focusTerminal = useCallback(() => {
    xtermRef.current?.focus()
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

    return installXterm({
      element: terminalElementRef.current,
      initialOutput: outputTailRef.current,
      xtermRef,
      isResizeSuspendedRef,
      resumeResizeFitRef,
      onDimensionsChangeRef,
      onInputRef,
      blockRef
    })
  }, [])

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
        aria-label={`${block.name} 文本输出`}
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
        aria-label={`${block.name} 文本输出`}
        data-terminal-output-tail="true"
        data-terminal-session-id={session.sessionId ?? ''}
      />
    </div>
  )
}

interface InstallXtermInput {
  readonly element: HTMLDivElement
  readonly initialOutput: string
  readonly xtermRef: MutableRefObject<XTerm | null>
  readonly isResizeSuspendedRef: MutableRefObject<boolean>
  readonly resumeResizeFitRef: MutableRefObject<() => void>
  readonly onDimensionsChangeRef: MutableRefObject<(dimensions: TerminalDimensions) => void>
  readonly onInputRef: MutableRefObject<(block: TerminalBlockSnapshot, input: string) => void>
  readonly blockRef: MutableRefObject<TerminalBlockSnapshot>
}

function installXterm({
  element,
  initialOutput,
  xtermRef,
  isResizeSuspendedRef,
  resumeResizeFitRef,
  onDimensionsChangeRef,
  onInputRef,
  blockRef
}: InstallXtermInput) {
  let lastReportedDimensions: TerminalDimensions | null = null
  let pendingFitAnimationFrame: number | null = null
  let hasDeferredResizeFit = false
  const terminal = new XTerm({
    convertEol: true,
    cursorBlink: true,
    fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.32,
    macOptionClickForcesSelection: true,
    rows: 9,
    theme: readTerminalTheme()
  })
  const fitAddon = new FitAddon()
  const reportDimensions = (): void => {
    const dimensions = { columns: terminal.cols, rows: terminal.rows }

    if (
      dimensions.columns <= 0 ||
      dimensions.rows <= 0 ||
      (lastReportedDimensions?.columns === dimensions.columns &&
        lastReportedDimensions.rows === dimensions.rows)
    ) {
      return
    }

    lastReportedDimensions = dimensions
    onDimensionsChangeRef.current(dimensions)
  }
  const fitAndReportDimensions = (): void => {
    fitAddon.fit()
    reportDimensions()
  }
  const requestFitAndReportDimensions = (): void => {
    if (isResizeSuspendedRef.current) {
      hasDeferredResizeFit = true
      return
    }

    if (pendingFitAnimationFrame !== null) {
      return
    }

    pendingFitAnimationFrame = window.requestAnimationFrame(() => {
      pendingFitAnimationFrame = null
      fitAndReportDimensions()
    })
  }
  const focusTerminalElement = (): void => {
    terminal.focus()
  }

  terminal.loadAddon(fitAddon)
  terminal.open(element)
  installTerminalSelectionCopy(terminal)
  xtermRef.current = terminal
  element.addEventListener('pointerdown', focusTerminalElement, true)
  fitAndReportDimensions()
  if (initialOutput.length > 0) {
    terminal.write(initialOutput)
  }
  const resizeObserver = new ResizeObserver(requestFitAndReportDimensions)

  resizeObserver.observe(element)
  resumeResizeFitRef.current = () => {
    if (!hasDeferredResizeFit) {
      return
    }

    hasDeferredResizeFit = false
    requestFitAndReportDimensions()
  }
  const dataSubscription = terminal.onData((input) => {
    onInputRef.current(blockRef.current, input)
  })
  const stopSynchronizingTheme = synchronizeTerminalTheme(terminal)

  return () => {
    if (pendingFitAnimationFrame !== null) {
      window.cancelAnimationFrame(pendingFitAnimationFrame)
    }

    element.removeEventListener('pointerdown', focusTerminalElement, true)
    dataSubscription.dispose()
    stopSynchronizingTheme()
    resizeObserver.disconnect()
    resumeResizeFitRef.current = () => undefined
    terminal.dispose()
    xtermRef.current = null
  }
}

function isTestRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}
