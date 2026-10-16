type ControlState = 'text' | 'escape' | 'escape-intermediate' | 'csi' | 'osc' | 'string'

/**
 * Matches literal output, independent of PTY chunk boundaries and VT decoration.
 * Keep only the marker suffix and parser state, never a control string payload.
 * This is not a screen emulator: line breaks remain literal, cursor edits are not replayed.
 * Sequence families: https://xtermjs.org/docs/api/vtfeatures/
 */
export class OutputReadinessMatcher {
  private state: ControlState = 'text'
  private tail = ''
  private matched = false

  constructor(private readonly text: string) {}

  accept(data: string): boolean {
    if (this.matched) return true
    let plain = ''
    for (const character of data) {
      if (this.isText(character.charCodeAt(0))) plain += character
    }
    const combined = this.tail + plain
    this.matched = combined.includes(this.text)
    this.tail = this.matched || this.text.length <= 1 ? '' : combined.slice(1 - this.text.length)
    return this.matched
  }

  private isText(code: number): boolean {
    if (code === 0x1b) {
      this.state = 'escape'
    } else if (code === 0x9b) {
      this.state = 'csi'
    } else if (code === 0x9d) {
      this.state = 'osc'
    } else if (code === 0x90 || code === 0x98 || code === 0x9e || code === 0x9f) {
      this.state = 'string'
    } else if (code === 0x18 || code === 0x1a || (code >= 0x80 && code <= 0x9f)) {
      this.state = 'text'
    } else if (this.state === 'osc' || this.state === 'string') {
      if (this.state === 'osc' && code === 0x07) this.state = 'text'
    } else if (code < 0x20) {
      return code >= 0x09 && code <= 0x0d
    } else if (code === 0x7f) {
      return false
    } else if (this.state === 'escape') {
      if (code === 0x5b) this.state = 'csi'
      else if (code === 0x5d) this.state = 'osc'
      else if (code === 0x50 || code === 0x58 || code === 0x5e || code === 0x5f) {
        this.state = 'string'
      } else this.state = code < 0x30 ? 'escape-intermediate' : 'text'
    } else if (this.state === 'escape-intermediate') {
      if (code >= 0x30) this.state = 'text'
    } else if (this.state === 'csi') {
      if (code >= 0x40 && code <= 0x7e) this.state = 'text'
    } else {
      return true
    }
    return false
  }
}
