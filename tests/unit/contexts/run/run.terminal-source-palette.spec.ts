import { canonicalTerminalPalettes } from '../../../../src/contexts/run/application/dto/TerminalPalette.generated'
import { createTerminalOscColorResponse } from '../../../../src/contexts/run/infrastructure/terminal-model/terminalSourcePalette'

describe('terminal source palette', () => {
  it.each(['light', 'dark'] as const)(
    'answers OSC foreground and background from the canonical %s palette',
    (theme) => {
      expect(createTerminalOscColorResponse(10, theme)).toBe(
        createOscColorResponse(10, canonicalTerminalPalettes[theme].foreground)
      )
      expect(createTerminalOscColorResponse(11, theme)).toBe(
        createOscColorResponse(11, canonicalTerminalPalettes[theme].background)
      )
    }
  )
})

function createOscColorResponse(code: 10 | 11, color: string): string {
  const red = color.slice(1, 3)
  const green = color.slice(3, 5)
  const blue = color.slice(5, 7)
  return `\u001b]${code};rgb:${red}${red}/${green}${green}/${blue}${blue}\u001b\\`
}
