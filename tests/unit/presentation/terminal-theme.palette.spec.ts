import { canonicalTerminalPalettes } from '../../../src/contexts/run/application/dto/TerminalPalette.generated'
import { readCanonicalTerminalTheme } from '../../../src/presentation/app-shell/terminalTheme'

describe('terminal theme palette', () => {
  it.each(['light', 'dark'] as const)(
    'gives renderer xterm the canonical %s terminal palette',
    (theme) => {
      expect(readCanonicalTerminalTheme(theme)).toBe(canonicalTerminalPalettes[theme])
    }
  )
})
