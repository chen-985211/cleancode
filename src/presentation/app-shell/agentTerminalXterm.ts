import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import type { MutableRefObject } from 'react'

import { readTerminalTheme, synchronizeTerminalTheme } from './terminalTheme'
import type { TerminalDimensions } from './types'

const defaultAgentTerminalDimensions: TerminalDimensions = {
  columns: 88,
  rows: 24
}

export function installAgentXterm(input: {
  readonly element: HTMLDivElement
  readonly initialOutput: string
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (input: string) => void
  readonly xtermRef: MutableRefObject<XTerm | null>
}): () => void {
  let pendingFitAnimationFrame: number | null = null
  let lastReportedDimensions: TerminalDimensions | null = null
  const terminal = new XTerm({
    convertEol: true,
    cursorBlink: true,
    fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.32,
    rows: defaultAgentTerminalDimensions.rows,
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
    input.onDimensionsChange(dimensions)
  }
  const requestFit = (): void => {
    if (pendingFitAnimationFrame !== null) {
      return
    }

    pendingFitAnimationFrame = window.requestAnimationFrame(() => {
      pendingFitAnimationFrame = null
      fitAddon.fit()
      reportDimensions()
    })
  }

  terminal.loadAddon(fitAddon)
  terminal.open(input.element)
  input.xtermRef.current = terminal
  fitAddon.fit()
  reportDimensions()
  const dataSubscription = terminal.onData(input.onInput)
  const stopSynchronizingTheme = synchronizeTerminalTheme(terminal)
  if (input.initialOutput) {
    terminal.write(input.initialOutput)
  }
  const resizeObserver = new ResizeObserver(requestFit)
  resizeObserver.observe(input.element)

  return () => {
    if (pendingFitAnimationFrame !== null) {
      window.cancelAnimationFrame(pendingFitAnimationFrame)
    }

    dataSubscription.dispose()
    stopSynchronizingTheme()
    resizeObserver.disconnect()
    terminal.dispose()
    input.xtermRef.current = null
  }
}

export const defaultAgentXtermDimensions = defaultAgentTerminalDimensions
