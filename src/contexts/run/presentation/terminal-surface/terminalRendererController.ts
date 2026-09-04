import type { IDisposable } from '@xterm/xterm'

import type { TerminalRasterScale } from './terminalZoomRasterPolicy'

export type TerminalRendererState = 'dom' | 'webgl'

interface TerminalRendererAddon {
  dispose(): void
  onContextLoss(listener: () => void): IDisposable
  setRasterScale(scale: TerminalRasterScale): void
  refreshRasterAlignment?(): void
}

interface TerminalRendererHost {
  readonly rows: number
  loadAddon(addon: TerminalRendererAddon): void
  refresh(start: number, end: number): void
}

interface TerminalRendererControllerOptions {
  readonly loadAddon?: () => Promise<TerminalRendererAddon>
  readonly onStateChange?: (state: TerminalRendererState) => void
  readonly scheduleRefresh?: (refresh: () => void) => void
}

export class TerminalRendererController {
  private addon: TerminalRendererAddon | null = null
  private contextLossSubscription: IDisposable | null = null
  private terminal: TerminalRendererHost | null = null
  private isDisposed = false
  private activationId = 0
  private currentState: TerminalRendererState = 'dom'
  private rasterScale: TerminalRasterScale = 1
  private readonly loadAddon: () => Promise<TerminalRendererAddon>
  private readonly onStateChange: (state: TerminalRendererState) => void
  private readonly scheduleRefresh: (refresh: () => void) => void

  constructor(options: TerminalRendererControllerOptions = {}) {
    this.loadAddon = options.loadAddon ?? loadWebglAddon
    this.onStateChange = options.onStateChange ?? (() => undefined)
    this.scheduleRefresh = options.scheduleRefresh ?? scheduleRendererRefresh
  }

  get state(): TerminalRendererState {
    return this.currentState
  }

  refreshRasterAlignment(): void {
    if (!this.isDisposed) this.addon?.refreshRasterAlignment?.()
  }

  setRasterScale(scale: TerminalRasterScale): void {
    if (this.isDisposed || scale === this.rasterScale) return
    this.addon?.setRasterScale(scale)
    this.rasterScale = scale
  }

  async activate(terminal: TerminalRendererHost): Promise<void> {
    if (this.isDisposed || this.addon) return
    const activationId = ++this.activationId

    try {
      const addon = await this.loadAddon()
      if (this.isDisposed || activationId !== this.activationId) {
        addon.dispose()
        return
      }

      try {
        addon.setRasterScale(this.rasterScale)
      } catch {
        addon.dispose()
        return
      }
      const contextLossSubscription = addon.onContextLoss(() => this.fallBackToDom())
      try {
        terminal.loadAddon(addon)
      } catch {
        contextLossSubscription.dispose()
        addon.dispose()
        return
      }

      this.terminal = terminal
      this.addon = addon
      this.contextLossSubscription = contextLossSubscription
      this.setState('webgl')
    } catch {
      // The built-in DOM renderer remains authoritative when WebGL is unavailable.
    }
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.activationId += 1
    this.contextLossSubscription?.dispose()
    this.contextLossSubscription = null
    this.addon?.dispose()
    this.addon = null
    this.terminal = null
  }

  private fallBackToDom(): void {
    if (this.isDisposed || this.currentState !== 'webgl') return
    const terminal = this.terminal
    const addon = this.addon
    this.contextLossSubscription?.dispose()
    this.contextLossSubscription = null
    this.addon = null
    this.terminal = null
    addon?.dispose()
    this.setState('dom')
    if (!terminal) return
    terminal.refresh(0, Math.max(0, terminal.rows - 1))
    this.scheduleRefresh(() => {
      if (!this.isDisposed && this.currentState === 'dom') {
        terminal.refresh(0, Math.max(0, terminal.rows - 1))
      }
    })
  }

  private setState(state: TerminalRendererState): void {
    if (this.currentState === state) return
    this.currentState = state
    this.onStateChange(state)
  }
}

function scheduleRendererRefresh(refresh: () => void): void {
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(refresh, 0)
    return
  }

  requestAnimationFrame(() => requestAnimationFrame(refresh))
}

async function loadWebglAddon(): Promise<TerminalRendererAddon> {
  const { WebglAddon } = await import('@xterm/addon-webgl')
  return new WebglAddon()
}
