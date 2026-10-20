import type { ITheme } from '@xterm/xterm'

import { canonicalTerminalPalettes } from '../../application/dto/TerminalPalette.generated'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

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
  return canonicalTerminalPalettes[theme]
}

export function readTerminalThemeProjectionMatrix(sourceTheme: TerminalSourceTheme): number[] {
  const targetTheme = sourceTheme === 'light' ? 'dark' : 'light'
  const source = readRgb(canonicalTerminalPalettes[sourceTheme].background)
  const target = readRgb(canonicalTerminalPalettes[targetTheme].background)
  // The sRGB hue-rotate(180deg) matrix from Filter Effects §13.1.4.
  const hueRows = [
    [-0.574, 1.43, 0.144],
    [0.426, 0.43, 0.144],
    [0.426, 1.43, -0.856]
  ]
  const rows = hueRows.flatMap((hueRow, channel) => {
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
