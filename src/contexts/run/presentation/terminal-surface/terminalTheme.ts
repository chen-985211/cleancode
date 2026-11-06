import type { ITheme, Terminal } from '@xterm/xterm'

import { canonicalTerminalPalettes } from '../../application/dto/TerminalPalette.generated'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

// The sRGB hue-rotate(180deg) matrix from Filter Effects §13.1.4.
const halfTurnHueMatrix = [
  [-0.574, 1.43, 0.144],
  [0.426, 0.43, 0.144],
  [0.426, 1.43, -0.856]
] as const

export function readCanonicalTerminalSearchTheme(theme: TerminalSourceTheme): {
  readonly active: string
  readonly border: string
  readonly match: string
} {
  return readTerminalSearchThemeVariables(document.documentElement, (variable) =>
    variable.replace('--cc-terminal-', `--cc-terminal-${theme}-`)
  )
}

function readTerminalSearchThemeVariables(
  root: HTMLElement,
  resolveVariable: (variable: string) => string
): {
  readonly active: string
  readonly border: string
  readonly match: string
} {
  const styles = getComputedStyle(root)
  return {
    active: styles.getPropertyValue(resolveVariable('--cc-terminal-search-active')).trim(),
    border: styles.getPropertyValue(resolveVariable('--cc-terminal-search-border')).trim(),
    match: styles.getPropertyValue(resolveVariable('--cc-terminal-search-match')).trim()
  }
}

export function readCanonicalTerminalTheme(theme: TerminalSourceTheme): ITheme {
  const { background, foreground, cursor, cursorAccent, selectionBackground } =
    canonicalTerminalPalettes[theme]
  // Native ANSI whites disappear on a light source background, including after projection.
  // Keep the existing readable white slots there; xterm owns all remaining ANSI colors.
  return {
    background,
    foreground,
    cursor,
    cursorAccent,
    selectionBackground,
    ...(theme === 'light'
      ? {
          white: canonicalTerminalPalettes.light.white,
          brightWhite: canonicalTerminalPalettes.light.brightWhite
        }
      : {})
  }
}

export function readTerminalThemeProjectionMatrix(sourceTheme: TerminalSourceTheme): number[] {
  const targetTheme = sourceTheme === 'light' ? 'dark' : 'light'
  const source = readRgb(canonicalTerminalPalettes[sourceTheme].background)
  const target = readRgb(canonicalTerminalPalettes[targetTheme].background)
  const rows = halfTurnHueMatrix.flatMap((hueRow, channel) => {
    const invertedBackground = hueRow.reduce(
      (sum, coefficient, index) => sum + coefficient * (1 - source[index]!),
      0
    )
    // Preserve white text in dark projections and black text in light projections.
    const gain =
      targetTheme === 'dark'
        ? (1 - target[channel]!) / (1 - invertedBackground)
        : target[channel]! / invertedBackground
    const offset = targetTheme === 'dark' ? 1 - gain : 0

    return [...hueRow.map((coefficient) => -gain * coefficient), 0, gain + offset]
  })

  return [...rows, 0, 0, 0, 1, 0]
}

export function readProjectedLightGlyphForeground(): string {
  const projection = readTerminalThemeProjectionMatrix('dark')
  const target = readRgb(canonicalTerminalPalettes.light.foreground)
  // Dark → light applies gain * (1 - hue(rgb)). Undo the gain and inversion,
  // then undo the hue rotation with the same half-turn.
  const rotated = target.map((channel, i) => 1 - channel / projection[i * 5 + 4]!)
  const hex = halfTurnHueMatrix.map((row) => {
    const channel = row.reduce((sum, coefficient, i) => sum + coefficient * rotated[i]!, 0)
    return Math.round(Math.max(0, Math.min(1, channel)) * 255)
      .toString(16)
      .padStart(2, '0')
  })
  return '#' + hex.join('')
}

export function setProjectedGlyphLayer(
  terminal: Terminal,
  projection: HTMLElement | null,
  sourceTheme: TerminalSourceTheme
): void {
  const current = terminal.options.indexedGlyphLayer
  if (current && current.element.parentElement === projection && projection) return
  if (current) {
    terminal.options.indexedGlyphLayer = null
    current.element.remove()
  }
  if (
    !projection?.matches(`.terminal-theme-projection[data-terminal-source-theme="${sourceTheme}"]`)
  )
    return

  const element = projection.ownerDocument.createElement('div')
  element.className = 'terminal-indexed-glyph-layer'
  element.setAttribute('aria-hidden', 'true')
  projection.append(element)
  const matrix = readTerminalThemeProjectionMatrix(sourceTheme)
  const target = readCanonicalTerminalTheme(sourceTheme === 'dark' ? 'light' : 'dark')
  terminal.options.indexedGlyphLayer = {
    element,
    foreground: target.foreground,
    white: target.white,
    brightWhite: target.brightWhite,
    projectBackground: (rgb) => {
      const r = (rgb >>> 16) & 255
      const g = (rgb >>> 8) & 255
      const b = rgb & 255
      const channel = (offset: number): number =>
        Math.max(
          0,
          Math.min(
            255,
            Math.round(
              matrix[offset]! * r +
                matrix[offset + 1]! * g +
                matrix[offset + 2]! * b +
                matrix[offset + 4]! * 255
            )
          )
        )
      return (channel(0) << 16) | (channel(5) << 8) | channel(10)
    }
  }
}

function readRgb(color: string): readonly [number, number, number] {
  const channel = (offset: number): number =>
    Number.parseInt(color.slice(offset, offset + 2), 16) / 255
  return [channel(1), channel(3), channel(5)]
}

export function readTerminalSourceTheme(
  root: HTMLElement = document.documentElement
): TerminalSourceTheme {
  return root.dataset.theme === 'light' ? 'light' : 'dark'
}
