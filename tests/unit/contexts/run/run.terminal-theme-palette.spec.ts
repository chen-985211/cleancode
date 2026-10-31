import { canonicalTerminalPalettes } from '../../../../src/contexts/run/application/dto/TerminalPalette.generated'
import {
  readCanonicalTerminalTheme,
  readTerminalThemeProjectionMatrix
} from '../../../../src/contexts/run/presentation/terminal-surface/terminalTheme'

describe('terminal theme palette', () => {
  it.each(['light', 'dark'] as const)(
    'maps the %s source background to the opposite theme background',
    (theme) => {
      const source = canonicalTerminalPalettes[theme]
      const target = canonicalTerminalPalettes[theme === 'light' ? 'dark' : 'light']

      expect(projectColor(source.background, readTerminalThemeProjectionMatrix(theme))).toBe(
        target.background
      )
    }
  )

  it.each(['light', 'dark'] as const)(
    'gives renderer xterm the canonical %s terminal palette',
    (theme) => {
      expect(readCanonicalTerminalTheme(theme)).toBe(canonicalTerminalPalettes[theme])
    }
  )

  it.each(['light', 'dark'] as const)(
    'keeps characters readable inside block cursors for the %s source theme and its projection',
    (theme) => {
      const palette = readCanonicalTerminalTheme(theme)
      const cursor = requireColor(palette.cursor)
      const cursorText = requireColor(palette.cursorAccent)
      const matrix = readTerminalThemeProjectionMatrix(theme)

      expect(colorContrastRatio(cursorText, cursor)).toBeGreaterThanOrEqual(4.5)
      expect(
        colorContrastRatio(projectColor(cursorText, matrix), projectColor(cursor, matrix))
      ).toBeGreaterThanOrEqual(4.5)
    }
  )

  it.each(['light', 'dark'] as const)(
    'keeps ANSI white foregrounds readable for the %s source theme and its projection',
    (theme) => {
      const palette = readCanonicalTerminalTheme(theme)
      const background = requireColor(palette.background)
      const matrix = readTerminalThemeProjectionMatrix(theme)
      const projectedBackground = projectColor(background, matrix)

      for (const foreground of [palette.white, palette.brightWhite]) {
        const requiredForeground = requireColor(foreground)
        expect(colorContrastRatio(requiredForeground, background)).toBeGreaterThanOrEqual(4.5)
        expect(
          colorContrastRatio(projectColor(requiredForeground, matrix), projectedBackground)
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

function projectColor(color: string, matrix: readonly number[]): string {
  const input = [0, 2, 4].map(
    (offset) => Number.parseInt(color.slice(1 + offset, 3 + offset), 16) / 255
  )
  const channels = [0, 1, 2].map((row) => {
    const offset = row * 5
    const value = input.reduce(
      (sum, channel, column) => sum + channel * matrix[offset + column]!,
      matrix[offset + 4]!
    )
    return Math.round(Math.max(0, Math.min(1, value)) * 255)
  })
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
