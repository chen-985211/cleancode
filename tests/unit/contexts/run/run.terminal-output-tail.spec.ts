import {
  appendTerminalOutputTail,
  terminalOutputTailMaxCharacters
} from '../../../../src/contexts/run/presentation/view-models/terminalOutputTail'

describe('terminal output tail', () => {
  it('keeps recent terminal output within a fixed character limit', () => {
    const oldOutput = 'old-line\n'.repeat(terminalOutputTailMaxCharacters)
    const recentOutput = 'recent-output'

    const tail = appendTerminalOutputTail(oldOutput, recentOutput)

    expect(tail).toHaveLength(terminalOutputTailMaxCharacters)
    expect(tail).toContain(recentOutput)
    expect(tail.startsWith('old-line\nold-line')).toBe(false)
  })

  it('accumulates small terminal chunks without trimming them', () => {
    const tail = appendTerminalOutputTail('hello ', 'terminal')

    expect(tail).toBe('hello terminal')
  })
})
