import type { ITheme, Terminal } from '@xterm/xterm'

import { canonicalTerminalPalettes } from '../../application/dto/TerminalPalette.generated'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

// The sRGB hue-rotate(180deg) matrix from Filter Effects §13.1.4.
const halfTurnHueMatrix = [
  [-0.574, 1.43, 0.144],
  [0.426, 0.43, 0.144],
  [0.426, 1.43, -0.856]
] as const

export interface TerminalColorPair {
  readonly role: 'foreground' | 'background'
  readonly dark: number
  readonly light: number
}

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
  const target = parseInt(canonicalTerminalPalettes.light.foreground.slice(1), 16)
  return (
    '#' +
    unprojectTerminalRgb(target, readTerminalThemeProjectionMatrix('dark'))
      .toString(16)
      .padStart(6, '0')
  )
}

function unprojectTerminalRgb(rgb: number, matrix: readonly number[]): number {
  // Undo the per-channel gain and offset. A half-turn is its own inverse.
  const rotated = [16, 8, 0].map((shift, i) => {
    const gain = -matrix[i * 5 + 1]! / halfTurnHueMatrix[i]![1]
    return (matrix[i * 5 + 4]! * 255 - ((rgb >>> shift) & 255)) / gain
  })
  const [r, g, b] = halfTurnHueMatrix.map((row) =>
    Math.max(
      0,
      Math.min(
        255,
        row.reduce((sum, coefficient, i) => sum + coefficient * rotated[i]!, 0)
      )
    )
  ) as [number, number, number]
  // Quantizing the inverse per channel can miss the target by a byte. Prefer an
  // adjacent representable paint color that the viewport filter maps exactly.
  for (const red of [Math.floor(r), Math.ceil(r)]) {
    for (const green of [Math.floor(g), Math.ceil(g)]) {
      for (const blue of [Math.floor(b), Math.ceil(b)]) {
        const paint = (red << 16) | (green << 8) | blue
        if (projectTerminalRgb(paint, matrix) === rgb) return paint
      }
    }
  }
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

export function createProjectedGlyphLayer(
  element: HTMLElement,
  sourceTheme: TerminalSourceTheme,
  onBitmapChange: (allocated: boolean) => void,
  colorPairs?: readonly TerminalColorPair[]
): NonNullable<Terminal['options']['indexedGlyphLayer']> {
  const matrix = readTerminalThemeProjectionMatrix(sourceTheme)
  const other = sourceTheme === 'dark' ? 'light' : 'dark'
  const target = readCanonicalTerminalTheme(other)
  const rgbForeground = new Map<number, number>()
  const rgbBackground = new Map<number, number>()
  const directBackground = new Map<number, number>()
  for (const pair of colorPairs ?? []) {
    if (pair.role === 'foreground') rgbForeground.set(pair[sourceTheme], pair[other])
    else {
      const paint = unprojectTerminalRgb(pair[other], matrix)
      rgbBackground.set(pair[sourceTheme], paint)
      if (projectTerminalRgb(paint, matrix) !== pair[other]) {
        directBackground.set(pair[sourceTheme], pair[other])
      }
    }
  }
  return {
    directBackground,
    onBitmapChange,
    element,
    rgbForeground,
    rgbBackground,
    foreground: target.foreground,
    white: target.white,
    brightWhite: target.brightWhite,
    projectBackground: (rgb) => projectTerminalRgb(rgb, matrix)
  }
}

function projectTerminalRgb(rgb: number, matrix: readonly number[]): number {
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
