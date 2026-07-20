import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm, type IDisposable } from '@xterm/xterm'

import type { TerminalSnapshot } from '../../contexts/run/application/dto/TerminalModelSnapshot'
import type { SequencedTerminalOutput } from '../../contexts/run/application/ports/TerminalModelPort'
import { installTerminalSelectionCopy } from './terminalSelectionCopy'
import type {
  TerminalRestoreResult,
  TerminalSurface,
  TerminalSurfaceAttachment
} from './terminalSurfaceRegistry'
import { readTerminalTheme, synchronizeTerminalTheme } from './terminalTheme'
import type { TerminalDimensions } from './types'

const terminalSurfaceScrollbackRows = 1000
const terminalPendingOutputLimitBytes = 1024 * 1024

export function createTerminalXtermSurface(): TerminalSurface {
  return new XtermTerminalSurface()
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
  private readonly pendingOutputs: SequencedTerminalOutput[] = []
  private readonly idleResolvers = new Set<() => void>()
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
  private isRestoring = true
  private isWriteInFlight = false
  private hasSnapshot = false
  private restoreRequired = false
  private expectedSequence = 0
  private lastQueuedSequence = 0
  private pendingOutputBytes = 0
  private onDimensionsChange: (dimensions: TerminalDimensions) => void = () => undefined
  private onInput: (input: string) => void = () => undefined
  private onRestoreRequired: () => void = () => undefined

  constructor() {
    this.terminal.loadAddon(this.fitAddon)
  }

  attach(attachment: TerminalSurfaceAttachment): void {
    if (this.isDisposed) return
    if (this.element && this.element !== attachment.element) this.detach(this.element)

    this.element = attachment.element
    this.onDimensionsChange = attachment.onDimensionsChange
    this.onInput = attachment.onInput
    this.onRestoreRequired = attachment.onRestoreRequired
    this.isResizeSuspended = attachment.isResizeSuspended
    attachment.element.addEventListener('pointerdown', this.focus, true)

    if (!this.isOpened) {
      this.terminal.open(attachment.element)
      installTerminalSelectionCopy(this.terminal)
      this.dataSubscription = this.terminal.onData((input) => this.onInput(input))
      this.stopSynchronizingTheme = synchronizeTerminalTheme(this.terminal)
      this.isOpened = true
    }

    this.fitAndReportDimensions()
    this.resizeObserver = new ResizeObserver(this.requestFitAndReportDimensions)
    this.resizeObserver.observe(attachment.element)
  }

  detach(element: HTMLDivElement): void {
    if (this.element !== element) return
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
    if (this.element) this.terminal.focus()
  }

  getDiagnostics() {
    return { pendingOutputBytes: this.pendingOutputBytes }
  }

  async restore(snapshot: TerminalSnapshot): Promise<TerminalRestoreResult> {
    if (this.isDisposed) return 'retry'
    this.isRestoring = true
    await this.waitForIdle()
    if (this.isDisposed) return 'retry'

    this.terminal.reset()
    this.terminal.resize(snapshot.dimensions.columns, snapshot.dimensions.rows)
    await this.writeToTerminal(snapshot.content)
    this.expectedSequence = snapshot.sequence
    while (this.pendingOutputs[0]?.sequence <= snapshot.sequence) this.pendingOutputs.shift()
    this.recalculatePendingState(snapshot.sequence)

    if (this.restoreRequired || !hasContiguousSequence(this.pendingOutputs, snapshot.sequence)) {
      this.clearPendingOutputs(snapshot.sequence)
      this.restoreRequired = false
      return 'retry'
    }

    this.hasSnapshot = true
    this.isRestoring = false
    this.drainPendingOutputs()
    this.fitAndReportDimensions()
    return 'ready'
  }

  setResizeSuspended(isResizeSuspended: boolean): void {
    const wasResizeSuspended = this.isResizeSuspended
    this.isResizeSuspended = isResizeSuspended
    if (wasResizeSuspended && !isResizeSuspended && this.hasDeferredResizeFit) {
      this.hasDeferredResizeFit = false
      this.requestFitAndReportDimensions()
    }
  }

  write(output: SequencedTerminalOutput): void {
    if (this.isDisposed || output.sequence <= this.lastQueuedSequence) return
    if (this.hasSnapshot && output.sequence !== this.lastQueuedSequence + 1) {
      this.requestRestore()
      return
    }
    if (
      !this.hasSnapshot &&
      this.pendingOutputs.length > 0 &&
      output.sequence !== this.lastQueuedSequence + 1
    ) {
      this.restoreRequired = true
      return
    }

    const byteLength = new TextEncoder().encode(output.data).byteLength
    if (this.pendingOutputBytes + byteLength > terminalPendingOutputLimitBytes) {
      if (this.hasSnapshot) this.requestRestore()
      else this.restoreRequired = true
      return
    }

    this.pendingOutputs.push(output)
    this.pendingOutputBytes += byteLength
    this.lastQueuedSequence = output.sequence
    if (!this.isRestoring) this.drainPendingOutputs()
  }

  dispose(): void {
    if (this.isDisposed) return
    if (this.element) this.detach(this.element)
    this.isDisposed = true
    this.pendingOutputs.length = 0
    this.pendingOutputBytes = 0
    this.resolveIdleWaiters()
    this.dataSubscription?.dispose()
    this.stopSynchronizingTheme?.()
    this.terminal.dispose()
  }

  private drainPendingOutputs(): void {
    if (this.isDisposed || this.isRestoring || this.isWriteInFlight) return
    const output = this.pendingOutputs.shift()
    if (!output) {
      this.resolveIdleWaiters()
      return
    }

    this.pendingOutputBytes = Math.max(
      0,
      this.pendingOutputBytes - new TextEncoder().encode(output.data).byteLength
    )
    this.isWriteInFlight = true
    this.terminal.write(output.data, () => {
      this.isWriteInFlight = false
      this.expectedSequence = output.sequence
      this.resolveIdleWaiters()
      this.drainPendingOutputs()
    })
  }

  private requestRestore(): void {
    if (this.isRestoring) return
    this.clearPendingOutputs(this.expectedSequence)
    this.hasSnapshot = false
    this.isRestoring = true
    this.onRestoreRequired()
  }

  private clearPendingOutputs(sequence: number): void {
    this.pendingOutputs.length = 0
    this.pendingOutputBytes = 0
    this.expectedSequence = sequence
    this.lastQueuedSequence = sequence
  }

  private recalculatePendingState(snapshotSequence: number): void {
    this.pendingOutputBytes = this.pendingOutputs.reduce(
      (total, output) => total + new TextEncoder().encode(output.data).byteLength,
      0
    )
    this.lastQueuedSequence = this.pendingOutputs.at(-1)?.sequence ?? snapshotSequence
  }

  private waitForIdle(): Promise<void> {
    if (!this.isWriteInFlight) return Promise.resolve()
    return new Promise((resolve) => this.idleResolvers.add(resolve))
  }

  private resolveIdleWaiters(): void {
    if (this.isWriteInFlight) return
    for (const resolve of this.idleResolvers) resolve()
    this.idleResolvers.clear()
  }

  private writeToTerminal(output: string): Promise<void> {
    return new Promise((resolve) => this.terminal.write(output, resolve))
  }

  private readonly requestFitAndReportDimensions = (): void => {
    if (!this.element) return
    if (this.isResizeSuspended) {
      this.hasDeferredResizeFit = true
      return
    }
    if (this.pendingFitAnimationFrame !== null) return

    this.pendingFitAnimationFrame = window.requestAnimationFrame(() => {
      this.pendingFitAnimationFrame = null
      this.fitAndReportDimensions()
    })
  }

  private fitAndReportDimensions(): void {
    if (!this.element) return
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

function hasContiguousSequence(
  outputs: readonly SequencedTerminalOutput[],
  snapshotSequence: number
): boolean {
  return outputs.every((output, index) => output.sequence === snapshotSequence + index + 1)
}
