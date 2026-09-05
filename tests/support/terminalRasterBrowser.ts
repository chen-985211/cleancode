import type { Page } from 'playwright'
import type { Terminal } from '@xterm/xterm'
import type { WebglAddon } from '@xterm/addon-webgl'

export function renderTerminalRasterFixture(
  page: Page,
  options: {
    readonly addonSource: string
    readonly entry: 'esm' | 'cjs'
    readonly columns: number
    readonly theme: 'light' | 'dark'
    readonly xtermSource: string
    readonly zoom: number
    readonly rasterScale: number
  }
) {
  return page.evaluate(async (input) => {
    const startedAt = performance.now()
    const { addonSource, entry, columns, theme, xtermSource, zoom, rasterScale } = input
    const fixtureWindow = window as Window & { rasterFixtureTerminal?: Terminal }
    fixtureWindow.rasterFixtureTerminal?.dispose()
    document.body.replaceChildren()
    document.body.style.margin = '0'
    const importSource = async (source: string) => {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
      try {
        // Keep this browser import out of Vitest's server-side module transform.
        const importInBrowser = new Function('url', 'return import(url)') as (
          url: string
        ) => Promise<unknown>
        return await importInBrowser(url)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    const terminalModule = (await importSource(xtermSource)) as { Terminal: typeof Terminal }
    const addonModule = (await importSource(
      entry === 'esm'
        ? addonSource
        : `${addonSource}\nexport const WebglAddon = globalThis.WebglAddon.WebglAddon;`
    )) as { WebglAddon: typeof WebglAddon }
    const modulesLoadedAt = performance.now()
    const container = document.createElement('div')
    container.style.cssText = `position:absolute;left:19.3px;top:21.7px;transform:scale(${zoom});transform-origin:0 0;width:600px;height:300px;`
    document.body.append(container)
    const terminal = new terminalModule.Terminal({
      allowProposedApi: true,
      cols: columns,
      rows: 10,
      cursorBlink: false,
      fontFamily: 'Consolas, Liberation Mono, Menlo, monospace',
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1.32,
      theme:
        theme === 'light'
          ? { background: '#ffffff', foreground: '#202020' }
          : { background: '#202020', foreground: '#eeeeee' }
    })
    fixtureWindow.rasterFixtureTerminal = terminal
    terminal.open(container)
    const addon = new addonModule.WebglAddon(true)
    terminal.loadAddon(addon)
    await new Promise<void>((resolve) =>
      terminal.write(
        `\x1b[?25l${'M '.repeat(25)}\r\n${'中文，清晰度。'.repeat(4)}\r\n0123456789 abcdef ABCDEF\r\n\x1b[1mBold text\x1b[0m  e\u0301  \u{1f642}\r\n\x1b[4mUnderline\x1b[0m`,
        resolve
      )
    )
    const screen = container.querySelector<HTMLElement>('.xterm-screen')!
    const screenWidth = Number.parseFloat(screen.style.width)
    const screenHeight = Number.parseFloat(screen.style.height)
    addon.setRasterScale(rasterScale)
    const preparedAt = performance.now()
    let renderedAt = preparedAt
    await new Promise<void>((resolve) => {
      const subscription = terminal.onRender(() => {
        subscription.dispose()
        renderedAt = performance.now()
        requestAnimationFrame(() => resolve())
      })
      terminal.refresh(0, terminal.rows - 1)
    })
    const frameReadyAt = performance.now()
    const canvas = Array.from(container.querySelectorAll('canvas')).find((candidate) =>
      candidate.getContext('webgl2')
    )!
    const gl = canvas.getContext('webgl2')!
    const pixels = new Uint8Array(canvas.width * canvas.height * 4)
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    const pixelsReadAt = performance.now()
    const glyphs = new Set<string>()
    let referenceGlyph: number[] | undefined
    let glyphMaximumDifference = 0
    let hasInk = false
    for (let column = 0; column < 40; column += 2) {
      const left = Math.round((column * canvas.width) / terminal.cols)
      const glyph: number[] = []
      for (let y = 0; y < Math.floor(canvas.height / terminal.rows); y += 1) {
        for (let x = 0; x < Math.floor(canvas.width / terminal.cols); x += 1) {
          const pixel = ((canvas.height - 1 - y) * canvas.width + left + x) * 4
          const red = pixels[pixel]!
          glyph.push(red)
          if (theme === 'light' ? red < 200 : red > 100) hasInk = true
        }
      }
      glyphs.add(glyph.join(','))
      referenceGlyph ??= glyph
      for (let index = 0; index < glyph.length; index += 1) {
        glyphMaximumDifference = Math.max(
          glyphMaximumDifference,
          Math.abs(glyph[index]! - referenceGlyph[index]!)
        )
      }
    }
    const bounds = canvas.getBoundingClientRect()
    const originalBacking = { width: canvas.width, height: canvas.height }
    container.style.left = '37.63px'
    container.style.top = '43.29px'
    addon.refreshRasterAlignment()
    const panned = canvas.getBoundingClientRect()
    addon.refreshRasterAlignment()
    const alignedAgain = canvas.getBoundingClientRect()
    container.style.left = '19.3px'
    container.style.top = '21.7px'
    addon.refreshRasterAlignment()
    return {
      timings: {
        moduleLoadMs: modulesLoadedAt - startedAt,
        prepareMs: preparedAt - modulesLoadedAt,
        renderWaitMs: renderedAt - preparedAt,
        nextFrameWaitMs: frameReadyAt - renderedAt,
        readPixelsMs: pixelsReadAt - frameReadyAt,
        totalMs: performance.now() - startedAt
      },
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      screenWidth,
      screenHeight,
      preservesScreenGeometry:
        Number.parseFloat(screen.style.width) === screenWidth &&
        Number.parseFloat(screen.style.height) === screenHeight,
      displayWidth: bounds.width,
      displayHeight: bounds.height,
      displayLeft: bounds.left,
      displayTop: bounds.top,
      devicePixelRatio: window.devicePixelRatio,
      columns: terminal.cols,
      rows: terminal.rows,
      glyphVariants: glyphs.size,
      glyphMaximumDifference,
      pannedLeft: panned.left,
      pannedTop: panned.top,
      alignmentIsIdempotent: panned.left === alignedAgain.left && panned.top === alignedAgain.top,
      alignmentPreservesBacking:
        originalBacking.width === canvas.width && originalBacking.height === canvas.height,
      hasInk
    }
  }, options)
}
