import type { Terminal, IDisposable } from '@xterm/xterm'

/** Owns the boundary between a restored buffer and its first visible frame. */
export class TerminalSurfacePresentation {
  private host: HTMLElement | null = null
  private renderSubscription: IDisposable | null = null
  private frame: number | null = null
  private revision = 0
  private ready = false
  private resuming = false
  private pendingGrid: { readonly cols: number; readonly rows: number } | null = null

  constructor(private readonly terminal: Terminal) {}

  attach(host: HTMLElement, resume = false): void {
    this.host = host
    this.resuming = resume
    if (resume && this.ready) this.reveal(host)
    else this.conceal()
  }

  conceal(): void {
    this.cancel()
    this.ready = false
    if (this.host) {
      this.host.dataset.terminalContentReady = 'false'
      this.host.setAttribute('aria-busy', 'true')
    }
    // Opacity preserves measurement and xterm's rendering while suppressing replay frames.
    if (this.terminal.element) {
      this.terminal.element.style.opacity = '0'
      this.terminal.element.setAttribute('aria-hidden', 'true')
    }
  }

  present(canPresent: () => boolean): void {
    if (!this.host || this.ready || !canPresent()) return
    const { cols, rows } = this.terminal
    if (
      this.renderSubscription &&
      this.pendingGrid?.cols === cols &&
      this.pendingGrid.rows === rows
    )
      return
    this.cancel()
    const revision = this.revision
    const host = this.host
    this.pendingGrid = { cols, rows }
    this.renderSubscription = this.terminal.onRender(({ start, end }) => {
      if (start > 0 || end < rows - 1 || this.frame !== null) return
      const reveal = () => {
        this.frame = null
        if (revision !== this.revision || this.host !== host || !canPresent()) return
        if (this.terminal.cols !== cols || this.terminal.rows !== rows) {
          this.cancel()
          this.present(canPresent)
          return
        }
        this.renderSubscription?.dispose()
        this.renderSubscription = null
        this.ready = true
        this.reveal(host)
      }
      if (this.resuming) reveal()
      else this.frame = window.requestAnimationFrame(reveal)
    })
    this.terminal.refresh(0, rows - 1)
  }

  detach(preserve = false): void {
    if (preserve) this.cancel()
    else this.conceal()
    this.host = null
  }

  private reveal(host: HTMLElement): void {
    if (this.terminal.element) {
      this.terminal.element.style.opacity = ''
      this.terminal.element.removeAttribute('aria-hidden')
    }
    host.dataset.terminalContentReady = 'true'
    host.setAttribute('aria-busy', 'false')
  }

  private cancel(): void {
    this.pendingGrid = null
    this.revision += 1
    this.renderSubscription?.dispose()
    this.renderSubscription = null
    if (this.frame !== null) window.cancelAnimationFrame(this.frame)
    this.frame = null
  }
}
