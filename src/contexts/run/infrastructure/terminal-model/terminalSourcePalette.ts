import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

interface TerminalSourcePalette {
  readonly foreground: string
  readonly background: string
}

const terminalSourcePalettes: Readonly<Record<TerminalSourceTheme, TerminalSourcePalette>> = {
  dark: {
    foreground: '#d6dee8',
    background: '#0b1017'
  },
  light: {
    foreground: '#243142',
    background: '#f7f9fc'
  }
}

export function createTerminalOscColorResponse(code: 10 | 11, theme: TerminalSourceTheme): string {
  const palette = terminalSourcePalettes[theme]
  const color = code === 10 ? palette.foreground : palette.background
  return `\u001b]${code};${toOscRgb(color)}\u001b\\`
}

function toOscRgb(color: string): string {
  const red = color.slice(1, 3)
  const green = color.slice(3, 5)
  const blue = color.slice(5, 7)
  return `rgb:${red}${red}/${green}${green}/${blue}${blue}`
}
