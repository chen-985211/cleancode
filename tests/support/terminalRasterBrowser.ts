import type { Page } from 'playwright'
import type { Terminal } from '@xterm/xterm'
import type { WebglAddon } from '@xterm/addon-webgl'

export function renderTerminalRasterFixture(
  page: Page,
  options: {
    readonly addonSource: string
    readonly entry: 'esm' | 'cjs'
    readonly font: 'fixture' | 'surface'
    readonly columns: number
    readonly theme: 'light' | 'dark'
    readonly xtermSource: string
    readonly zoom: number
    readonly rasterScale: number
  }
) {
  return page.evaluate(async (input) => {
    const startedAt = performance.now()
    const { addonSource, entry, font, columns, theme, xtermSource, zoom, rasterScale } = input
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
    const terminalModule = (await importSource(
      entry === 'esm' ? xtermSource : `${xtermSource}\nexport const Terminal = globalThis.Terminal;`
    )) as { Terminal: typeof Terminal }
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
      fontFamily:
        font === 'surface'
          ? 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace'
          : 'Consolas, Liberation Mono, Menlo, monospace',
      fontSize: font === 'surface' ? 13 : 12,
      fontWeight: font === 'surface' ? 530 : 500,
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
    const orange = '\x1b[38;2;215;119;87m'
    const blackBackground = '\x1b[48;2;0;0;0m'
    const defaultBackground = '\x1b[49m'
    const blockRows = [
      ` ▐${blackBackground}██████${defaultBackground}▌`,
      ` █${blackBackground}▛▜${defaultBackground}█`,
      ` █${blackBackground}▙▟${defaultBackground}█`,
      ` █${blackBackground}█\x1b[48;2;255;255;255m█\x1b[48;2;0;68;102m█${defaultBackground}█`,
      ` ▐${blackBackground}▛███▛█${defaultBackground}`
    ]
    await new Promise<void>((resolve) =>
      terminal.write(
        `\x1b[?25l${'M '.repeat(25)}\r\n${'中文，清晰度。'.repeat(4)}\r\n0123456789 abcdef ABCDEF\r\n\x1b[1mBold text\x1b[0m  e\u0301  \u{1f642}\r\n\x1b[4mUnderline\x1b[0m\r\n${orange}${blockRows.join('\r\n')}\x1b[0m`,
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
    // These scanlines pass through solid foreground, including the mascot's
    // forehead. Changing only cell backgrounds must not punch holes in it.
    const blockGlyphs = [
      { name: 'half blocks', row: 5, left: 1.5, right: 8.5, height: 0.5 },
      { name: 'upper quadrants', row: 6, left: 1, right: 5, height: 0.25 },
      { name: 'lower quadrants', row: 7, left: 1, right: 5, height: 0.75 },
      { name: 'full blocks across background colors', row: 8, left: 1, right: 6, height: 0.5 },
      { name: 'Claude mascot forehead', row: 9, left: 1.5, right: 8, height: 0.25 }
    ].map((span) => {
      const left = Math.ceil((span.left * canvas.width) / terminal.cols) + 1
      const right = Math.floor((span.right * canvas.width) / terminal.cols) - 1
      const y = Math.floor(((span.row + span.height) * canvas.height) / terminal.rows)
      let maximumDifference = 0
      const unexpectedPixels: { x: number; y: number; color: number[] }[] = []
      for (let x = left; x < right; x += 1) {
        const pixel = ((canvas.height - 1 - y) * canvas.width + x) * 4
        let difference = 0
        for (const [channel, expected] of [215, 119, 87, 255].entries()) {
          difference = Math.max(difference, Math.abs(pixels[pixel + channel]! - expected))
        }
        maximumDifference = Math.max(maximumDifference, difference)
        if (difference > 2 && unexpectedPixels.length < 3) {
          unexpectedPixels.push({ x, y, color: Array.from(pixels.subarray(pixel, pixel + 4)) })
        }
      }
      return { name: span.name, maximumDifference, unexpectedPixels }
    })
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
    // Budget changes on group disclosure can resize any visible surface. Sample
    // before yielding to another frame, when Chromium can present the bitmap.
    const rasterTransitions = [rasterScale === 1 ? 1.6 : 1, rasterScale].map((scale) => {
      addon.setRasterScale(scale)
      const frame = new Uint8Array(canvas.width * canvas.height * 4)
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, frame)
      let inkPixels = 0
      for (let index = 0; index < frame.length; index += 4) {
        if (
          frame[index + 3]! > 0 &&
          (theme === 'light' ? frame[index]! < 200 : frame[index]! > 100)
        ) {
          inkPixels += 1
        }
      }
      return { scale, inkPixels }
    })
    return {
      blockGlyphs,
      rasterTransitions,
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
