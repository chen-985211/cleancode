import { canonicalTerminalPalettes } from '../../application/dto/TerminalPalette.generated'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

export function createTerminalOscColorResponse(code: 10 | 11, theme: TerminalSourceTheme): string {
  const palette = canonicalTerminalPalettes[theme]
  const color = code === 10 ? palette.foreground : palette.background
  return `\u001b]${code};${toOscRgb(color)}\u001b\\`
}

function toOscRgb(color: string): string {
  const red = color.slice(1, 3)
  const green = color.slice(3, 5)
  const blue = color.slice(5, 7)
  return `rgb:${red}${red}/${green}${green}/${blue}${blue}`
}
