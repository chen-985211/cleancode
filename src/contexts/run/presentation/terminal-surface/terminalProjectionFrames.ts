import type { IDisposable, Terminal } from '@xterm/xterm'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'
import {
  createProjectedGlyphLayer,
  readProjectedLightGlyphForeground,
  readTerminalSourceTheme,
  type TerminalColorPair
} from './terminalTheme'

/** Keep the viewport filter and the separate ink on the same painted xterm frame. */
export class TerminalProjectionFrames {
  private root?: HTMLElement
  private wrapper?: HTMLElement
  private ink?: HTMLElement
  private observer?: MutationObserver
  private render?: IDisposable
  private pairs?: readonly TerminalColorPair[]

  constructor(
    private readonly terminal: Terminal,
    private readonly source: TerminalSourceTheme,
    private readonly onBitmapChange: (allocated: boolean) => void
  ) {}

  attach(viewport: HTMLElement): void {
    this.detach()
    this.root = viewport.ownerDocument.documentElement
    const parent = viewport.parentElement
    if (
      parent?.matches(`.terminal-theme-projection[data-terminal-source-theme="${this.source}"]`)
    ) {
      this.wrapper = parent
    }
    this.update()
    this.observer = new MutationObserver(() => this.update())
    this.observer.observe(this.root, { attributes: true, attributeFilter: ['data-theme'] })
  }

  setColorPairs(pairs?: readonly TerminalColorPair[]): void {
    if (pairs === this.pairs) return
    this.pairs = pairs
    this.update()
  }

  private update(): void {
    if (!this.root) return
    const mismatch = readTerminalSourceTheme(this.root) !== this.source
    const wrapper = this.wrapper
    if (!wrapper) {
      this.terminal.options.defaultGlyphForeground =
        mismatch && this.source === 'dark' ? readProjectedLightGlyphForeground() : ''
      return
    }
    this.render?.dispose()
    this.render = this.terminal.onRender(({ start, end }) => {
      if (start !== 0 || end < this.terminal.rows - 1) return
      wrapper.dataset.terminalProjected = String(mismatch)
      if (!mismatch) this.removeInk()
      this.render?.dispose()
      this.render = undefined
    })
    if (mismatch) {
      if (!this.ink) {
        this.ink = wrapper.ownerDocument.createElement('div')
        this.ink.className = 'terminal-indexed-glyph-layer'
        this.ink.setAttribute('aria-hidden', 'true')
        wrapper.append(this.ink)
      }
      this.terminal.options.indexedGlyphLayer = createProjectedGlyphLayer(
        this.ink,
        this.source,
        this.onBitmapChange,
        this.pairs
      )
    } else {
      this.terminal.options.indexedGlyphLayer = null
    }
    // DEC 2026 or an offscreen surface can defer this paint. Keep the previous
    // host and CSS until xterm has actually rendered the complete viewport.
    this.terminal.refresh(0, this.terminal.rows - 1)
  }

  private removeInk(): void {
    this.ink?.remove()
    this.ink = undefined
  }

  detach(): void {
    this.observer?.disconnect()
    this.render?.dispose()
    this.observer = undefined
    this.render = undefined
    if (this.wrapper) delete this.wrapper.dataset.terminalProjected
    this.wrapper = undefined
    this.root = undefined
    this.terminal.options.indexedGlyphLayer = null
    this.terminal.options.defaultGlyphForeground = ''
    this.removeInk()
  }
}
