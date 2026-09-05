import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

type ParserState =
  | 'ground'
  | 'escape'
  | 'escape-intermediate'
  | 'csi-entry'
  | 'csi-param'
  | 'csi-intermediate'
  | 'csi-ignore'
  | 'osc'
  | 'string-ignore'
  | 'dcs-entry'
  | 'dcs-param'
  | 'dcs-intermediate'
  | 'dcs-ignore'
  | 'dcs-payload'

const continuationLimit = 1024 * 1024

/**
 * SerializeAddon saves the screen, but not an unfinished VT sequence or UTF-16
 * character. Track only that continuation; xterm remains the screen owner.
 * Transitions follow xterm 6's VT500 parser, including C0 execution inside CSI:
 * https://github.com/xtermjs/xterm.js/blob/6.0.0/src/common/parser/EscapeSequenceParser.ts
 */
export class TerminalParserContinuation {
  private state: ParserState = 'ground'
  private prefix = ''
  private highSurrogate = ''
  private overflow = false

  accept(data: string): void {
    if (!data) return
    let index = 0
    if (this.highSurrogate) {
      const first = this.highSurrogate
      this.highSurrogate = ''
      const second = data.charCodeAt(index++)
      if (second >= 0xdc00 && second <= 0xdfff) this.consume(first + data[0])
      else {
        this.consume(first)
        this.consume(data[0])
      }
    }
    for (; index < data.length; index += 1) {
      const code = data.charCodeAt(index)
      if (code >= 0xd800 && code <= 0xdbff) {
        const first = data[index++]
        if (index === data.length) {
          this.highSurrogate = first
          break
        }
        const second = data.charCodeAt(index)
        if (second >= 0xdc00 && second <= 0xdfff) this.consume(first + data[index])
        else {
          this.consume(first)
          this.consume(data[index])
        }
      } else if (code !== 0xfeff) this.consume(data[index])
    }
  }

  read(): string {
    if (this.overflow) {
      throw createExpectedAppError(
        'TERMINAL_RECOVERY_STORAGE_LIMIT',
        'Unfinished terminal control sequence exceeds the recovery limit.'
      )
    }
    return this.prefix + this.highSurrogate
  }

  private consume(character: string): void {
    const code = character.codePointAt(0)!
    if (code === 0x1b) return this.start('escape', character)
    if (code === 0x9b) return this.start('csi-entry', character)
    if (code === 0x9d) return this.start('osc', character)
    if (code === 0x90) return this.start('dcs-entry', character)
    if (code === 0x98 || code === 0x9e || code === 0x9f) {
      return this.start('string-ignore', character)
    }
    if (code === 0x18 || code === 0x1a || (code >= 0x80 && code < 0xa0)) {
      return this.start('ground', '')
    }
    if (this.state === 'ground') return
    if (this.state === 'osc' && code === 0x07) return this.start('ground', '')

    // These bytes have already executed against the serialized screen, or were
    // ignored. Replaying e.g. a line feed inside a CSI would execute it twice.
    if (code < 0x20 && this.state !== 'dcs-payload') return
    if (code === 0x7f && this.state !== 'osc') return

    const next = nextState(this.state, code)
    if (next === 'ground') return this.start('ground', '')
    if (next === 'csi-ignore') return this.start(next, '\u001b[0<')
    if (next === 'dcs-ignore') return this.start(next, '\u001bP0<')
    if (next === 'string-ignore' && this.state === next) return
    this.state = next
    if (this.overflow) return
    if (this.prefix.length + character.length > continuationLimit) {
      this.prefix = ''
      this.overflow = true
    } else this.prefix += character
  }

  private start(state: ParserState, prefix: string): void {
    this.state = state
    this.prefix = prefix
    this.overflow = false
  }
}

function nextState(state: ParserState, code: number): ParserState {
  if (state === 'osc' || state === 'dcs-payload' || state === 'dcs-ignore') return state
  if (state === 'string-ignore') return code < 0x80 ? state : 'ground'
  if (state === 'csi-ignore') return code >= 0x40 && code < 0x7f ? 'ground' : state
  if (code >= 0xa0) return 'ground'
  if (state === 'escape') {
    if (code === 0x5b) return 'csi-entry'
    if (code === 0x5d) return 'osc'
    if (code === 0x50) return 'dcs-entry'
    if (code === 0x58 || code === 0x5e || code === 0x5f) return 'string-ignore'
    return code < 0x30 ? 'escape-intermediate' : 'ground'
  }
  if (state === 'escape-intermediate') return code < 0x30 ? state : 'ground'

  const dcs = state.startsWith('dcs-')
  if (code >= 0x40) return dcs ? 'dcs-payload' : 'ground'
  if (code < 0x30) return dcs ? 'dcs-intermediate' : 'csi-intermediate'
  if (state.endsWith('intermediate') || (state.endsWith('param') && code >= 0x3c)) {
    return dcs ? 'dcs-ignore' : 'csi-ignore'
  }
  return dcs ? 'dcs-param' : 'csi-param'
}
