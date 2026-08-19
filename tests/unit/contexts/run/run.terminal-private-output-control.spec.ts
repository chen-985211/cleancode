import {
  acceptTerminalPrivateOutput,
  createTerminalPrivateOutputControl,
  flushTerminalPrivateOutput,
  isTerminalPrivateOutputControlToken
} from '../../../../src/contexts/run/infrastructure/pty/TerminalPrivateOutputControl'

const token = 'fixed-token'
const beginMarker = `\u001b]633;CLEANCODE_OUTPUT_CONTROL:${token}:begin\u0007`
const endMarker = `\u001b]633;CLEANCODE_OUTPUT_CONTROL:${token}:end\u0007`

describe('terminal private output control', () => {
  it.each([
    { expected: true, label: 'minimum length', value: 'a'.repeat(16) },
    { expected: true, label: 'maximum length', value: 'Z'.repeat(128) },
    { expected: true, label: 'all supported characters', value: 'Ab_09-token-value' },
    { expected: false, label: 'below minimum length', value: 'a'.repeat(15) },
    { expected: false, label: 'above maximum length', value: 'a'.repeat(129) },
    { expected: false, label: 'spaces', value: 'token with spaces' },
    { expected: false, label: 'marker delimiter', value: '0123456789abcde:' },
    { expected: false, label: 'Unicode', value: '0123456789abcde中' },
    { expected: false, label: 'non-string value', value: 1234567890123456 },
    { expected: false, label: 'null', value: null }
  ])('validates output control token $label', ({ expected, value }) => {
    expect(isTerminalPrivateOutputControlToken(value)).toBe(expected)
  })

  it('removes one matching private cycle while preserving surrounding Unicode output', () => {
    const control = createTerminalPrivateOutputControl({ token })

    expect(
      acceptTerminalPrivateOutput(
        control,
        `配置已加载\r\n${beginMarker}\u001b[40m私有控制输出${endMarker}PS> 继续工作`
      )
    ).toBe('配置已加载\r\nPS> 继续工作')
    expect(flushTerminalPrivateOutput(control)).toBe('')
  })

  it('recognizes matching markers at every output chunk boundary', () => {
    const input = `profile>${beginMarker}\u001b[2Jprivate${endMarker}提示符>`

    for (let splitIndex = 0; splitIndex <= input.length; splitIndex += 1) {
      const control = createTerminalPrivateOutputControl({ token })
      const output = [
        acceptTerminalPrivateOutput(control, input.slice(0, splitIndex)),
        acceptTerminalPrivateOutput(control, input.slice(splitIndex)),
        flushTerminalPrivateOutput(control)
      ].join('')

      expect(output).toBe('profile>提示符>')
    }
  })

  it('preserves markers for another token and unrelated OSC frames byte-for-byte', () => {
    const control = createTerminalPrivateOutputControl({ token })
    const input = [
      'before',
      '\u001b]633;CLEANCODE_OUTPUT_CONTROL:another-token:begin\u0007',
      'not private',
      '\u001b]633;CLEANCODE_OUTPUT_CONTROL:another-token:end\u0007',
      '\u001b]633;CLEANCODE_JOB:fixed-token:started\u0007',
      '\u001b]633;CLEANCODE_SHELL_READY\u0007',
      endMarker,
      'after'
    ].join('')

    const output = [
      acceptTerminalPrivateOutput(control, input.slice(0, 37)),
      acceptTerminalPrivateOutput(control, input.slice(37, 91)),
      acceptTerminalPrivateOutput(control, input.slice(91)),
      flushTerminalPrivateOutput(control)
    ].join('')

    expect(output).toBe(input)
  })

  it('filters repeated private cycles without hiding output between them', () => {
    const control = createTerminalPrivateOutputControl({ token })

    expect(
      acceptTerminalPrivateOutput(control, `one${beginMarker}first${endMarker}two${beginMarker}sec`)
    ).toBe('onetwo')
    expect(acceptTerminalPrivateOutput(control, `ond${endMarker}three`)).toBe('three')
    expect(flushTerminalPrivateOutput(control)).toBe('')
  })

  it('keeps a private cycle hidden when its payload is exactly 4096 characters', () => {
    const control = createTerminalPrivateOutputControl({ token })
    const payload = 'x'.repeat(4096)

    expect(
      acceptTerminalPrivateOutput(control, `${beginMarker}${payload}${endMarker.slice(0, -1)}`)
    ).toBe('')
    expect(acceptTerminalPrivateOutput(control, endMarker.slice(-1))).toBe('')
    expect(acceptTerminalPrivateOutput(control, 'prompt>')).toBe('prompt>')
  })

  it('fails open when a completed private cycle exceeds 4096 characters', () => {
    const control = createTerminalPrivateOutputControl({ token })
    const oversizedCycle = `${beginMarker}${'x'.repeat(4097)}${endMarker}`

    expect(acceptTerminalPrivateOutput(control, oversizedCycle)).toBe(oversizedCycle)
    expect(
      acceptTerminalPrivateOutput(control, `visible${beginMarker}private${endMarker}again`)
    ).toBe('visibleagain')
  })

  it('fails open after 4096 unmatched private characters and recovers at the matching end marker', () => {
    const control = createTerminalPrivateOutputControl({ token })
    const allowedPayload = 'x'.repeat(4096)

    expect(acceptTerminalPrivateOutput(control, `${beginMarker}${allowedPayload}`)).toBe('')
    expect(acceptTerminalPrivateOutput(control, 'y')).toBe(`${beginMarker}${allowedPayload}y`)
    expect(acceptTerminalPrivateOutput(control, 'still visible')).toBe('still visible')
    expect(acceptTerminalPrivateOutput(control, endMarker.slice(0, -1))).toBe('')
    expect(acceptTerminalPrivateOutput(control, endMarker.slice(-1))).toBe(endMarker)
    expect(acceptTerminalPrivateOutput(control, `${beginMarker}hidden${endMarker}prompt>`)).toBe(
      'prompt>'
    )
  })

  it('flushes unconfirmed marker fragments and unterminated private output without data loss', () => {
    const visibleControl = createTerminalPrivateOutputControl({ token })
    const partialBegin = beginMarker.slice(0, -2)

    expect(acceptTerminalPrivateOutput(visibleControl, `visible${partialBegin}`)).toBe('visible')
    expect(flushTerminalPrivateOutput(visibleControl)).toBe(partialBegin)
    expect(flushTerminalPrivateOutput(visibleControl)).toBe('')

    const privateControl = createTerminalPrivateOutputControl({ token })
    expect(acceptTerminalPrivateOutput(privateControl, `${beginMarker}未完成内容`)).toBe('')
    expect(flushTerminalPrivateOutput(privateControl)).toBe(`${beginMarker}未完成内容`)
    expect(acceptTerminalPrivateOutput(privateControl, 'next')).toBe('next')
  })
})
