import { canonicalTerminalPalettes } from '../../../../src/contexts/run/application/dto/TerminalPalette.generated'
import { readCanonicalTerminalTheme } from '../../../../src/contexts/run/presentation/terminal-surface/terminalTheme'

describe('terminal theme palette', () => {
  it.each(['light', 'dark'] as const)(
    'gives renderer xterm the canonical %s terminal palette',
    (theme) => {
      expect(readCanonicalTerminalTheme(theme)).toBe(canonicalTerminalPalettes[theme])
    }
  )

  it.each(['light', 'dark'] as const)(
    'keeps ANSI white foregrounds readable for the %s source theme and its projection',
    (theme) => {
      const palette = readCanonicalTerminalTheme(theme)
      const background = requireColor(palette.background)

      for (const foreground of [palette.white, palette.brightWhite]) {
        const requiredForeground = requireColor(foreground)
        expect(colorContrastRatio(requiredForeground, background)).toBeGreaterThanOrEqual(4.5)
        expect(
          colorContrastRatio(invertRgb(requiredForeground), invertRgb(background))
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  )
})

function requireColor(color: string | undefined): string {
  if (!color) throw new Error('Terminal palette is missing a required color.')
  return color
}

function colorContrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance(color: string): number {
  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(color.slice(1 + offset, 3 + offset), 16) / 255
  )
  const linearChannels = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )
  return 0.2126 * linearChannels[0]! + 0.7152 * linearChannels[1]! + 0.0722 * linearChannels[2]!
}

function invertRgb(color: string): string {
  const channels = [0, 2, 4].map(
    (offset) => 255 - Number.parseInt(color.slice(1 + offset, 3 + offset), 16)
  )
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
