import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'
import { createTerminalOscColorResponse } from '../terminal-model/terminalSourcePalette'

export interface WindowsTerminalColorQueryBridgeResult {
  readonly output: string
  readonly responses: readonly string[]
}

const colorQuerySequences = [
  { code: 10, value: '\u001b]10;?\u0007' },
  { code: 10, value: '\u001b]10;?\u001b\\' },
  { code: 11, value: '\u001b]11;?\u0007' },
  { code: 11, value: '\u001b]11;?\u001b\\' }
] as const

export class WindowsTerminalColorQueryBridge {
  private pendingCandidate = ''

  constructor(private readonly terminalSourceTheme: TerminalSourceTheme) {}

  accept(data: string): WindowsTerminalColorQueryBridgeResult {
    const source = this.pendingCandidate + data
    const responses: string[] = []
    let output = ''
    let offset = 0
    this.pendingCandidate = ''

    while (offset < source.length) {
      const query = colorQuerySequences.find(({ value }) => source.startsWith(value, offset))
      if (query) {
        responses.push(createTerminalOscColorResponse(query.code, this.terminalSourceTheme))
        offset += query.value.length
        continue
      }

      const remainder = source.slice(offset)
      if (colorQuerySequences.some(({ value }) => value.startsWith(remainder))) {
        this.pendingCandidate = remainder
        break
      }

      output += source[offset]
      offset += 1
    }

    return { output, responses }
  }

  flush(): string {
    const output = this.pendingCandidate
    this.pendingCandidate = ''
    return output
  }
}
