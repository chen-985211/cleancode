import {
  createTerminalCapabilityEnvironment,
  terminalEmulationName
} from '../../../../src/contexts/run/application/services/TerminalCapabilityEnvironment'

describe('terminal capability environment', () => {
  it.each([
    ['dark', '15;0'],
    ['light', '0;15']
  ] as const)('pins the %s source theme capabilities', (theme, colorForegroundBackground) => {
    expect(createTerminalCapabilityEnvironment({}, theme)).toEqual({
      TERM: terminalEmulationName,
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'cleancode',
      COLORFGBG: colorForegroundBackground
    })
  })

  it('replaces reserved capability keys case-insensitively while preserving caller data', () => {
    expect(
      createTerminalCapabilityEnvironment(
        {
          term: 'provider-terminal',
          ColorTerm: 'provider-color',
          term_program: 'provider-program',
          colorfgbg: 'provider-palette',
          PROVIDER_TOKEN: 'provider-token'
        },
        'dark'
      )
    ).toEqual({
      PROVIDER_TOKEN: 'provider-token',
      TERM: terminalEmulationName,
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'cleancode',
      COLORFGBG: '15;0'
    })
  })

  it('does not synthesize, clear, or rename NO_COLOR', () => {
    expect(createTerminalCapabilityEnvironment({}, 'dark')).not.toHaveProperty('NO_COLOR')
    expect(createTerminalCapabilityEnvironment({ NO_COLOR: '1' }, 'dark')).toMatchObject({
      NO_COLOR: '1'
    })
  })
})
