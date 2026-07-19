import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm, type IDisposable } from '@xterm/xterm'
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

interface AgentXtermAttachment {
  readonly element: HTMLDivElement
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (input: string) => void
}

export interface AgentXtermSurface extends AgentXtermController {
  attach(attachment: AgentXtermAttachment): void
  detach(element: HTMLDivElement): void
  dispose(): void
}

export function createAgentXtermSurface(): AgentXtermSurface {
  return new XtermAgentSurface()
}

class XtermAgentSurface implements AgentXtermSurface {
  private readonly terminal = new XTerm({
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
  private readonly fitAddon = new FitAddon()
  private readonly pendingWriteResolvers = new Set<() => void>()
  private dataSubscription: IDisposable | null = null
  private resizeSubscription: IDisposable | null = null
  private resizeObserver: ResizeObserver | null = null
  private element: HTMLDivElement | null = null
  private isDisposed = false
  private isOpened = false
  private lastReportedDimensions: TerminalDimensions | null = null
  private lastWriteCompletion = Promise.resolve()
  private onDimensionsChange: (dimensions: TerminalDimensions) => void = () => undefined
  private onInput: (input: string) => void = () => undefined
  private pendingFitAnimationFrame: number | null = null
  private replacementGeneration = 0
  private terminalSourceTheme = readAgentTerminalSourceTheme()

  constructor() {
    this.terminal.loadAddon(this.fitAddon)
  }

  attach(attachment: AgentXtermAttachment): void {
    if (this.isDisposed) return
    if (this.element && this.element !== attachment.element) {
      this.detach(this.element)
    }

    this.element = attachment.element
    this.onDimensionsChange = attachment.onDimensionsChange
    this.onInput = attachment.onInput
    this.lastReportedDimensions = null
    attachment.element.dataset.agentTerminalSourceTheme = this.terminalSourceTheme

    if (!this.isOpened) {
      this.terminal.open(attachment.element)
      installTerminalSelectionCopy(this.terminal)
      this.dataSubscription = this.terminal.onData((input) => this.onInput(input))
      this.resizeSubscription = this.terminal.onResize(({ cols, rows }) => {
        this.reportDimensions({ columns: cols, rows })
      })
      this.isOpened = true
    } else if (
      this.terminal.element &&
      this.terminal.element.parentElement !== attachment.element
    ) {
      attachment.element.append(this.terminal.element)
    }

    this.fitAddon.fit()
    this.reportDimensions()
    if (this.terminal.rows > 0 && this.isOpened) {
      this.terminal.refresh(0, this.terminal.rows - 1)
    }
    this.resizeObserver = new ResizeObserver(this.requestFit)
    this.resizeObserver.observe(attachment.element)
  }

  detach(element: HTMLDivElement): void {
    if (this.element !== element) return

    if (this.pendingFitAnimationFrame !== null) {
      window.cancelAnimationFrame(this.pendingFitAnimationFrame)
      this.pendingFitAnimationFrame = null
    }
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.terminal.element?.remove()
    delete element.dataset.agentTerminalSourceTheme
    this.element = null
  }

  dispose(): void {
    if (this.isDisposed) return
    if (this.element) this.detach(this.element)

    this.isDisposed = true
    this.replacementGeneration += 1
    for (const resolveWrite of this.pendingWriteResolvers) resolveWrite()
    this.pendingWriteResolvers.clear()
    this.dataSubscription?.dispose()
    this.resizeSubscription?.dispose()
    this.terminal.dispose()
  }

  invalidateSessionReplacement(): void {
    this.replacementGeneration += 1
  }

  async replaceSession(replacement: {
    readonly onBind: () => boolean | void
    readonly replayOutput: string | (() => string)
    readonly sessionId: string
    readonly terminalSourceTheme: AgentTerminalSourceTheme
  }): Promise<void> {
    const generation = ++this.replacementGeneration
    const writesBeforeReplacement = this.lastWriteCompletion
    await writesBeforeReplacement

    if (this.isDisposed || generation !== this.replacementGeneration) return

    this.terminalSourceTheme = replacement.terminalSourceTheme
    if (this.element) {
      this.element.dataset.agentTerminalSourceTheme = replacement.terminalSourceTheme
    }
    this.terminal.options.theme = readCanonicalTerminalTheme(replacement.terminalSourceTheme)
    this.terminal.reset()

    if (
      replacement.onBind() === false ||
      this.isDisposed ||
      generation !== this.replacementGeneration
    ) {
      return
    }

    const replayOutput =
      typeof replacement.replayOutput === 'function'
        ? replacement.replayOutput()
        : replacement.replayOutput
    if (replayOutput) this.write(replayOutput)
  }

  write(data: string): void {
    if (this.isDisposed) return

    let resolveWrite = (): void => undefined
    const writeCompletion = new Promise<void>((resolve) => {
      resolveWrite = () => {
        this.pendingWriteResolvers.delete(resolveWrite)
        resolve()
      }
    })
    this.pendingWriteResolvers.add(resolveWrite)
    this.lastWriteCompletion = writeCompletion

    try {
      this.terminal.write(data, resolveWrite)
    } catch (error) {
      resolveWrite()
      throw error
    }
  }

  private readonly requestFit = (): void => {
    if (!this.element || this.pendingFitAnimationFrame !== null) return

    this.pendingFitAnimationFrame = window.requestAnimationFrame(() => {
      this.pendingFitAnimationFrame = null
      this.fitAddon.fit()
      this.reportDimensions()
    })
  }

  private reportDimensions(
    dimensions: TerminalDimensions = {
      columns: this.terminal.cols,
      rows: this.terminal.rows
    }
  ): void {
    if (
      dimensions.columns <= 0 ||
      dimensions.rows <= 0 ||
      (this.lastReportedDimensions?.columns === dimensions.columns &&
        this.lastReportedDimensions.rows === dimensions.rows)
    ) {
      return
    }

    this.lastReportedDimensions = dimensions
    this.onDimensionsChange(dimensions)
  }
}

export function installAgentXterm(input: {
  readonly element: HTMLDivElement
  readonly initialOutput: string
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (input: string) => void
  readonly xtermRef: MutableRefObject<AgentXtermController | null>
}): () => void {
  const surface = createAgentXtermSurface()
  input.xtermRef.current = surface
  surface.attach(input)
  if (input.initialOutput) surface.write(input.initialOutput)

  return () => {
    surface.dispose()
    if (input.xtermRef.current === surface) input.xtermRef.current = null
  }
}

export const defaultAgentXtermDimensions = defaultAgentTerminalDimensions

export function readAgentTerminalSourceTheme(): AgentTerminalSourceTheme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}
