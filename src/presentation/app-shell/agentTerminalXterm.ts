import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import type { MutableRefObject } from 'react'

import type { AgentTerminalSourceTheme } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import { readCanonicalTerminalTheme, readTerminalTheme } from './terminalTheme'
import { installTerminalSelectionCopy } from './terminalSelectionCopy'
import type { TerminalDimensions } from './types'

const defaultAgentTerminalDimensions: TerminalDimensions = {
  columns: 88,
  rows: 24
}

export interface AgentXtermController {
  invalidateSessionReplacement(): void
  replaceSession(input: {
    readonly onBind: () => boolean | void
    readonly replayOutput: string | (() => string)
    readonly sessionId: string
    readonly terminalSourceTheme: AgentTerminalSourceTheme
  }): Promise<void>
  write(data: string): void
}

export function installAgentXterm(input: {
  readonly element: HTMLDivElement
  readonly initialOutput: string
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (input: string) => void
  readonly xtermRef: MutableRefObject<AgentXtermController | null>
}): () => void {
  let disposed = false
  let replacementGeneration = 0
  let pendingFitAnimationFrame: number | null = null
  let lastReportedDimensions: TerminalDimensions | null = null
  let lastWriteCompletion = Promise.resolve()
  const pendingWriteResolvers = new Set<() => void>()
  input.element.dataset.agentTerminalSourceTheme = readAgentTerminalSourceTheme()
  const terminal = new XTerm({
    convertEol: true,
    cursorBlink: true,
    fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.32,
    macOptionClickForcesSelection: true,
    rows: defaultAgentTerminalDimensions.rows,
    theme: readTerminalTheme()
  })
  const fitAddon = new FitAddon()
  const reportDimensions = (
    dimensions: TerminalDimensions = { columns: terminal.cols, rows: terminal.rows }
  ): void => {
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
  installTerminalSelectionCopy(terminal)
  const controller: AgentXtermController = {
    invalidateSessionReplacement: () => {
      replacementGeneration += 1
    },
    replaceSession: async (replacement) => {
      const generation = ++replacementGeneration
      const writesBeforeReplacement = lastWriteCompletion
      await writesBeforeReplacement

      if (disposed || generation !== replacementGeneration) {
        return
      }

      input.element.dataset.agentTerminalSourceTheme = replacement.terminalSourceTheme
      terminal.options.theme = readCanonicalTerminalTheme(replacement.terminalSourceTheme)
      terminal.reset()
      const replayOutput =
        typeof replacement.replayOutput === 'function'
          ? replacement.replayOutput()
          : replacement.replayOutput

      if (replacement.onBind() === false || disposed || generation !== replacementGeneration) {
        return
      }

      if (replayOutput) {
        controller.write(replayOutput)
      }
    },
    write: (data) => {
      if (disposed) {
        return
      }

      let resolveWrite = (): void => undefined
      const writeCompletion = new Promise<void>((resolve) => {
        resolveWrite = () => {
          pendingWriteResolvers.delete(resolveWrite)
          resolve()
        }
      })
      pendingWriteResolvers.add(resolveWrite)
      lastWriteCompletion = writeCompletion

      try {
        terminal.write(data, resolveWrite)
      } catch (error) {
        resolveWrite()
        throw error
      }
    }
  }
  input.xtermRef.current = controller
  const resizeSubscription = terminal.onResize(({ cols, rows }) => {
    reportDimensions({ columns: cols, rows })
  })
  fitAddon.fit()
  reportDimensions()
  const dataSubscription = terminal.onData(input.onInput)
  if (input.initialOutput) {
    controller.write(input.initialOutput)
  }
  const resizeObserver = new ResizeObserver(requestFit)
  resizeObserver.observe(input.element)

  return () => {
    disposed = true
    replacementGeneration += 1
    for (const resolveWrite of pendingWriteResolvers) {
      resolveWrite()
    }
    pendingWriteResolvers.clear()

    if (pendingFitAnimationFrame !== null) {
      window.cancelAnimationFrame(pendingFitAnimationFrame)
    }

    dataSubscription.dispose()
    resizeSubscription.dispose()
    resizeObserver.disconnect()
    terminal.dispose()
    if (input.xtermRef.current === controller) {
      input.xtermRef.current = null
    }
    delete input.element.dataset.agentTerminalSourceTheme
  }
}

export const defaultAgentXtermDimensions = defaultAgentTerminalDimensions

export function readAgentTerminalSourceTheme(): AgentTerminalSourceTheme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}
