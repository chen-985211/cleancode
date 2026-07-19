import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm, type IDisposable } from '@xterm/xterm'

import { installTerminalSelectionCopy } from './terminalSelectionCopy'
import type { TerminalSurface, TerminalSurfaceAttachment } from './terminalSurfaceRegistry'
import { readTerminalTheme, synchronizeTerminalTheme } from './terminalTheme'
import type { TerminalDimensions } from './types'

const terminalSurfaceScrollbackRows = 1000

export function createTerminalXtermSurface(initialOutput: string): TerminalSurface {
  return new XtermTerminalSurface(initialOutput)
}

class XtermTerminalSurface implements TerminalSurface {
  private readonly terminal = new XTerm({
    convertEol: true,
    cursorBlink: true,
    fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.32,
    macOptionClickForcesSelection: true,
    rows: 9,
    scrollback: terminalSurfaceScrollbackRows,
    theme: readTerminalTheme()
  })
  private readonly fitAddon = new FitAddon()
  private element: HTMLDivElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private dataSubscription: IDisposable | null = null
  private stopSynchronizingTheme: (() => void) | null = null
  private pendingFitAnimationFrame: number | null = null
  private lastReportedDimensions: TerminalDimensions | null = null
  private isResizeSuspended = false
  private hasDeferredResizeFit = false
  private isOpened = false
  private isDisposed = false
  private onDimensionsChange: (dimensions: TerminalDimensions) => void = () => undefined
  private onInput: (input: string) => void = () => undefined

  constructor(private initialOutput: string) {
    this.terminal.loadAddon(this.fitAddon)
  }

  attach(attachment: TerminalSurfaceAttachment): void {
    if (this.isDisposed) {
      return
    }
    if (this.element && this.element !== attachment.element) {
      this.detach(this.element)
    }

    this.element = attachment.element
    this.onDimensionsChange = attachment.onDimensionsChange
    this.onInput = attachment.onInput
    this.isResizeSuspended = attachment.isResizeSuspended
    attachment.element.addEventListener('pointerdown', this.focus, true)

    if (!this.isOpened) {
      this.terminal.open(attachment.element)
      installTerminalSelectionCopy(this.terminal)
      this.dataSubscription = this.terminal.onData((input) => this.onInput(input))
      this.stopSynchronizingTheme = synchronizeTerminalTheme(this.terminal)
      this.isOpened = true
    } else if (
      this.terminal.element &&
      this.terminal.element.parentElement !== attachment.element
    ) {
      attachment.element.append(this.terminal.element)
    }

    this.fitAndReportDimensions()
    if (this.initialOutput) {
      this.terminal.write(this.initialOutput)
      this.initialOutput = ''
    } else if (this.terminal.rows > 0) {
      this.terminal.refresh(0, this.terminal.rows - 1)
    }

    this.resizeObserver = new ResizeObserver(this.requestFitAndReportDimensions)
    this.resizeObserver.observe(attachment.element)
  }

  detach(element: HTMLDivElement): void {
    if (this.element !== element) {
      return
    }

    if (this.pendingFitAnimationFrame !== null) {
      window.cancelAnimationFrame(this.pendingFitAnimationFrame)
      this.pendingFitAnimationFrame = null
    }
    element.removeEventListener('pointerdown', this.focus, true)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.terminal.element?.remove()
    this.element = null
  }

  readonly focus = (): void => {
    if (this.element) {
      this.terminal.focus()
    }
  }

  setResizeSuspended(isResizeSuspended: boolean): void {
    const wasResizeSuspended = this.isResizeSuspended

    this.isResizeSuspended = isResizeSuspended
    if (wasResizeSuspended && !isResizeSuspended && this.hasDeferredResizeFit) {
      this.hasDeferredResizeFit = false
      this.requestFitAndReportDimensions()
    }
  }

  write(output: string): void {
    if (!this.isDisposed) {
      this.terminal.write(output)
    }
  }

  dispose(): void {
    if (this.isDisposed) {
      return
    }

    if (this.element) {
      this.detach(this.element)
    }
    this.isDisposed = true
    this.dataSubscription?.dispose()
    this.stopSynchronizingTheme?.()
    this.terminal.dispose()
  }

  private readonly requestFitAndReportDimensions = (): void => {
    if (!this.element) {
      return
    }
    if (this.isResizeSuspended) {
      this.hasDeferredResizeFit = true
      return
    }
    if (this.pendingFitAnimationFrame !== null) {
      return
    }

    this.pendingFitAnimationFrame = window.requestAnimationFrame(() => {
      this.pendingFitAnimationFrame = null
      this.fitAndReportDimensions()
    })
  }

  private fitAndReportDimensions(): void {
    this.fitAddon.fit()
    const dimensions = { columns: this.terminal.cols, rows: this.terminal.rows }

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
