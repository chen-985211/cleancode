import { createTerminalOscColorResponse } from '../../../../src/contexts/run/infrastructure/terminal-model/terminalSourcePalette'
import { WindowsTerminalColorQueryBridge } from '../../../../src/contexts/run/infrastructure/pty/WindowsTerminalColorQueryBridge'

describe('Windows terminal color query bridge', () => {
  it.each(['light', 'dark'] as const)(
    'answers paired OSC 10/11 queries from the canonical %s palette',
    (theme) => {
      const bridge = new WindowsTerminalColorQueryBridge(theme)

      const result = bridge.accept('\u001b]10;?\u001b\\\u001b]11;?\u001b\\')

      expect(result).toEqual({
        output: '',
        responses: [
          createTerminalOscColorResponse(10, theme),
          createTerminalOscColorResponse(11, theme)
        ]
      })
    }
  )

  it('accepts BEL and ST terminators while preserving surrounding output order', () => {
    const bridge = new WindowsTerminalColorQueryBridge('light')

    const result = bridge.accept('before\u001b]10;?\u0007middle\u001b]11;?\u001b\\after')

    expect(result).toEqual({
      output: 'beforemiddleafter',
      responses: [
        createTerminalOscColorResponse(10, 'light'),
        createTerminalOscColorResponse(11, 'light')
      ]
    })
  })

  it.each([
    ['escape', ['before\u001b', ']10;?\u001b\\after']],
    ['osc prefix', ['before\u001b]1', '0;?\u001b\\after']],
    ['payload', ['before\u001b]10;', '?\u001b\\after']],
    ['ST terminator', ['before\u001b]10;?\u001b', '\\after']]
  ])('answers a query split at the %s boundary', (_boundary, chunks) => {
    const bridge = new WindowsTerminalColorQueryBridge('dark')

    const first = bridge.accept(chunks[0])
    const second = bridge.accept(chunks[1])

    expect(first).toEqual({ output: 'before', responses: [] })
    expect(second).toEqual({
      output: 'after',
      responses: [createTerminalOscColorResponse(10, 'dark')]
    })
  })

  it('passes through assignments, unknown queries, and malformed queries unchanged', () => {
    const bridge = new WindowsTerminalColorQueryBridge('light')
    const output =
      '\u001b]10;rgb:ffff/ffff/ffff\u001b\\' + '\u001b]12;?\u0007' + '\u001b]11;not-a-query\u001b\\'

    expect(bridge.accept(output)).toEqual({ output, responses: [] })
  })

  it('flushes an incomplete candidate without manufacturing a response', () => {
    const bridge = new WindowsTerminalColorQueryBridge('light')

    expect(bridge.accept('before\u001b]10;?')).toEqual({
      output: 'before',
      responses: []
    })
    expect(bridge.flush()).toBe('\u001b]10;?')
    expect(bridge.flush()).toBe('')
  })
})
