import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal as XTerm, type IDisposable } from '@xterm/xterm'

import type { TerminalSnapshot } from '../../contexts/run/application/dto/TerminalModelSnapshot'
import type { SequencedTerminalOutput } from '../../contexts/run/application/ports/TerminalModelPort'
import type { TerminalSourceTheme } from '../../contexts/run/domain/aggregates/TerminalSession'
import { installTerminalSelectionCopy } from './terminalSelectionCopy'
import type {
  TerminalRestoreResult,
  TerminalSearchDirection,
  TerminalSearchResults,
  TerminalSurface,
  TerminalSurfaceAttachment
} from './terminalSurfaceRegistry'
import {
  readCanonicalTerminalSearchTheme,
  readCanonicalTerminalTheme,
  readTerminalSourceTheme
} from './terminalTheme'
import type { TerminalDimensions } from './types'
import type { TerminalScrollbackRows } from '../../contexts/run/application/dto/TerminalRuntimeSettings'
import { TerminalRendererController } from './terminalRendererController'
import { createTerminalFileLinkProvider, hasOpenModifier } from './terminalFileLinks'

const terminalSurfaceScrollbackRows = 1000
const terminalPendingOutputLimitBytes = 1024 * 1024

export function createTerminalXtermSurface(
  terminalSourceTheme: TerminalSourceTheme = readTerminalSourceTheme()
): TerminalSurface {
  return new XtermTerminalSurface(terminalSourceTheme)
}

class XtermTerminalSurface implements TerminalSurface {
  private readonly terminal: XTerm
  private readonly fitAddon = new FitAddon()
  private readonly searchAddon = new SearchAddon({ highlightLimit: 1000 })
  private readonly unicodeAddon = new Unicode11Addon()
  private readonly webLinksAddon = new WebLinksAddon((event, target) => {
    this.activateDetectedLink(event, target)
  })
  private readonly rendererController = new TerminalRendererController({
    onStateChange: (state) => {
      if (this.element) this.element.dataset.terminalRenderer = state
    }
  })
  private readonly pendingOutputs: SequencedTerminalOutput[] = []
  private readonly idleResolvers = new Set<() => void>()
  private element: HTMLDivElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private dataSubscription: IDisposable | null = null
  private searchSubscription: IDisposable | null = null
  private fileLinkProviderSubscription: IDisposable | null = null
  private pendingFitAnimationFrame: number | null = null
  private lastReportedDimensions: TerminalDimensions | null = null
  private isResizeSuspended = false
  private hasDeferredResizeFit = false
  private isOpened = false
  private isRendererActivationSettled = false
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
  private onOpenLink: (target: string) => void = () => undefined
  private onOpenSearch: () => void = () => undefined
  private onRestoreRequired: () => void = () => undefined
  private onSearchResultsChange: (results: TerminalSearchResults) => void = () => undefined
  private searchQuery = ''

  constructor(private readonly terminalSourceTheme: TerminalSourceTheme) {
    this.terminal = new XTerm({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1.32,
      linkHandler: {
        activate: (_event, target) => this.onOpenLink(target)
      },
      macOptionClickForcesSelection: true,
      rows: 9,
      scrollback: terminalSurfaceScrollbackRows,
      theme: readCanonicalTerminalTheme(terminalSourceTheme)
    })
    this.terminal.loadAddon(this.fitAddon)
    this.terminal.loadAddon(this.searchAddon)
    this.terminal.loadAddon(this.unicodeAddon)
    this.terminal.loadAddon(this.webLinksAddon)
    this.terminal.unicode.activeVersion = '11'
    this.fileLinkProviderSubscription = this.terminal.registerLinkProvider(
      createTerminalFileLinkProvider(this.terminal, (target) => this.onOpenLink(target))
    )
  }

  private activateDetectedLink(event: MouseEvent, target: string): void {
    if (hasOpenModifier(event)) this.onOpenLink(target)
  }

  attach(attachment: TerminalSurfaceAttachment): void {
    if (this.isDisposed) return
    if (this.element && this.element !== attachment.element) this.detach(this.element)

    this.element = attachment.element
    this.element.dataset.terminalRenderer = this.rendererController.state
    this.element.dataset.terminalRendererReady = String(this.isRendererActivationSettled)
    this.element.dataset.terminalSourceTheme = this.terminalSourceTheme
    this.onDimensionsChange = attachment.onDimensionsChange
    this.onInput = attachment.onInput
    this.onOpenLink = attachment.onOpenLink
    this.onOpenSearch = attachment.onOpenSearch
    this.onRestoreRequired = attachment.onRestoreRequired
    this.onSearchResultsChange = attachment.onSearchResultsChange
    this.isResizeSuspended = attachment.isResizeSuspended
    attachment.element.addEventListener('pointerdown', this.focus, true)

    if (!this.isOpened) {
      this.terminal.open(attachment.element)
      const terminal = this.terminal
      void this.rendererController
        .activate({
          get rows() {
            return terminal.rows
          },
          loadAddon: (addon) =>
            terminal.loadAddon(addon as unknown as Parameters<XTerm['loadAddon']>[0]),
          refresh: (start, end) => terminal.refresh(start, end)
        })
        .finally(() => {
          this.isRendererActivationSettled = true
          if (this.element) this.element.dataset.terminalRendererReady = 'true'
        })
      installTerminalSelectionCopy(this.terminal, { onOpenSearch: () => this.onOpenSearch() })
      this.dataSubscription = this.terminal.onData((input) => this.onInput(input))
      this.searchSubscription = this.searchAddon.onDidChangeResults((results) =>
        this.onSearchResultsChange(results)
      )
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

  clearSearch(): void {
    this.searchQuery = ''
    this.searchAddon.clearDecorations()
    this.onSearchResultsChange({ resultCount: 0, resultIndex: 0 })
  }

  find(query: string, direction: TerminalSearchDirection): void {
    if (!query) {
      this.clearSearch()
      return
    }
    this.searchQuery = query

    const options: ISearchOptions = {
      decorations: readSearchDecorations(this.terminalSourceTheme),
      incremental: direction === 'incremental'
    }
    if (direction === 'previous') this.searchAddon.findPrevious(query, options)
    else this.searchAddon.findNext(query, options)
  }

  getDiagnostics() {
    return {
      pendingOutputBytes: this.pendingOutputBytes,
      rendererState: this.rendererController.state
    }
  }

  isBracketedPasteMode(): boolean {
    return this.terminal.modes.bracketedPasteMode
  }

  async restore(snapshot: TerminalSnapshot): Promise<TerminalRestoreResult> {
    if (this.isDisposed) return 'retry'
    this.isRestoring = true
    await this.waitForIdle()
    if (this.isDisposed) return 'retry'

    this.terminal.reset()
    this.terminal.resize(snapshot.dimensions.columns, snapshot.dimensions.rows)
    this.terminal.options.scrollback = snapshot.scrollbackRows
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
    if (this.searchQuery) this.find(this.searchQuery, 'incremental')
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

  setScrollbackRows(rows: TerminalScrollbackRows): void {
    if (!this.isDisposed) this.terminal.options.scrollback = rows
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
    this.searchSubscription?.dispose()
    this.fileLinkProviderSubscription?.dispose()
    this.rendererController.dispose()
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
      if (this.pendingOutputs.length === 0 && this.searchQuery) {
        this.find(this.searchQuery, 'incremental')
      }
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

function readSearchDecorations(
  terminalSourceTheme: TerminalSourceTheme
): NonNullable<ISearchOptions['decorations']> {
  const theme = readCanonicalTerminalSearchTheme(terminalSourceTheme)

  return {
    activeMatchBackground: theme.active,
    activeMatchBorder: theme.border,
    activeMatchColorOverviewRuler: theme.active,
    matchBackground: theme.match,
    matchBorder: theme.match,
    matchOverviewRuler: theme.match
  }
}
