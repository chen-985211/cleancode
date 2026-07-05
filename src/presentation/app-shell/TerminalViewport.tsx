import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalOutputEvent } from '../../contexts/run/application/ports/TerminalProcessPort'
import {
  terminalOutputBrowserEventName,
  type TerminalDimensions,
  type TerminalViewState
} from './types'

interface TerminalViewportProps {
  readonly block: TerminalBlockSnapshot
  readonly session: TerminalViewState
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (block: TerminalBlockSnapshot, input: string) => void
}

export function TerminalViewport({
  block,
  session,
  onDimensionsChange,
  onInput
}: TerminalViewportProps) {
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  const outputMirrorRef = useRef<HTMLPreElement | null>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const outputTextRef = useRef(session.output)
  const blockRef = useRef(block)
  const sessionRef = useRef(session)
  const onDimensionsChangeRef = useRef(onDimensionsChange)
  const onInputRef = useRef(onInput)
  const shouldKeepTerminalFocusRef = useRef(false)

  useEffect(() => {
    blockRef.current = block
  }, [block])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    onInputRef.current = onInput
  }, [onInput])

  useEffect(() => {
    onDimensionsChangeRef.current = onDimensionsChange
  }, [onDimensionsChange])

  useEffect(() => {
    if (outputMirrorRef.current) {
      outputMirrorRef.current.textContent = outputTextRef.current
    }
  })

  useEffect(() => {
    const appendOutput = (output: string): void => {
      outputTextRef.current = `${outputTextRef.current}${output}`
      if (outputMirrorRef.current) {
        outputMirrorRef.current.textContent = outputTextRef.current
      }
      xtermRef.current?.write(output, () => {
        if (sessionRef.current.status === 'running' && shouldKeepTerminalFocusRef.current) {
          xtermRef.current?.focus()
        }
      })
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
    shouldKeepTerminalFocusRef.current = true
    xtermRef.current?.focus()
    terminalElementRef.current
      ?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
      ?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (isTestRuntime() || !terminalElementRef.current) {
      return undefined
    }

    return installXterm({
      element: terminalElementRef.current,
      xtermRef,
      shouldKeepTerminalFocusRef,
      onDimensionsChangeRef,
      onInputRef,
      blockRef
    })
  }, [])

  useEffect(() => {
    const updateFocusPreference = (event: PointerEvent): void => {
      shouldKeepTerminalFocusRef.current = Boolean(
        terminalElementRef.current?.contains(event.target as globalThis.Node)
      )
    }

    document.addEventListener('pointerdown', updateFocusPreference, true)

    return () => document.removeEventListener('pointerdown', updateFocusPreference, true)
  }, [])

  useEffect(() => {
    if (session.status === 'running') {
      focusTerminal()
    }
  }, [focusTerminal, session.sessionId, session.status])

  if (isTestRuntime()) {
    return (
      <pre className="terminal-fallback" aria-label={`${block.name} 文本输出`}>
        {session.output}
      </pre>
    )
  }

  return (
    <div
      className="terminal-output-shell nodrag nopan nowheel"
      onPointerDownCapture={focusTerminal}
      onClickCapture={focusTerminal}
    >
      <div
        className="terminal-viewport nodrag nopan nowheel"
        ref={terminalElementRef}
        tabIndex={0}
        onPointerDown={focusTerminal}
        onClick={focusTerminal}
        onFocus={focusTerminal}
      />
      <pre
        className="terminal-output-mirror"
        ref={outputMirrorRef}
        aria-label={`${block.name} 文本输出`}
      />
    </div>
  )
}

interface InstallXtermInput {
  readonly element: HTMLDivElement
  readonly xtermRef: MutableRefObject<XTerm | null>
  readonly shouldKeepTerminalFocusRef: MutableRefObject<boolean>
  readonly onDimensionsChangeRef: MutableRefObject<(dimensions: TerminalDimensions) => void>
  readonly onInputRef: MutableRefObject<(block: TerminalBlockSnapshot, input: string) => void>
  readonly blockRef: MutableRefObject<TerminalBlockSnapshot>
}

function installXterm({
  element,
  xtermRef,
  shouldKeepTerminalFocusRef,
  onDimensionsChangeRef,
  onInputRef,
  blockRef
}: InstallXtermInput) {
  let lastReportedDimensions: TerminalDimensions | null = null
  const terminal = new XTerm({
    convertEol: true,
    cursorBlink: true,
    fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
    fontSize: 12,
    rows: 9,
    theme: {
      background: '#0b0f14',
      foreground: '#d7e2ee',
      cursor: '#f8fafc',
      green: '#49d17c',
      blue: '#60a5fa'
    }
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
  const focusTerminalElement = (): void => {
    shouldKeepTerminalFocusRef.current = true
    terminal.focus()
    element.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')?.focus({
      preventScroll: true
    })
  }

  terminal.loadAddon(fitAddon)
  terminal.open(element)
  xtermRef.current = terminal
  element.addEventListener('pointerdown', focusTerminalElement, true)
  element.addEventListener('mousedown', focusTerminalElement, true)
  element.addEventListener('click', focusTerminalElement, true)
  fitAndReportDimensions()
  const resizeObserver = new ResizeObserver(fitAndReportDimensions)

  resizeObserver.observe(element)
  const dataSubscription = terminal.onData((input) => {
    shouldKeepTerminalFocusRef.current = true
    onInputRef.current(blockRef.current, input)
    terminal.focus()
  })

  return () => {
    element.removeEventListener('pointerdown', focusTerminalElement, true)
    element.removeEventListener('mousedown', focusTerminalElement, true)
    element.removeEventListener('click', focusTerminalElement, true)
    dataSubscription.dispose()
    resizeObserver.disconnect()
    terminal.dispose()
    xtermRef.current = null
  }
}

function isTestRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}
