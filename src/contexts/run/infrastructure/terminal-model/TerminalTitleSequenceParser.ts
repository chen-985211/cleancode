const escape = '\u001b'
const operatingSystemCommand = `${escape}]`
const stringTerminator = `${escape}\\`
const bell = '\u0007'
const maximumBufferedSequenceLength = 4_096

export class TerminalTitleSequenceParser {
  private buffer = ''

  accept(data: string): readonly string[] {
    this.buffer += data
    const titles: string[] = []

    while (this.buffer) {
      const sequenceStart = this.buffer.indexOf(operatingSystemCommand)
      if (sequenceStart < 0) {
        this.buffer = this.buffer.endsWith(escape) ? escape : ''
        break
      }
      if (sequenceStart > 0) this.buffer = this.buffer.slice(sequenceStart)

      const commandEnd = this.buffer.indexOf(';', operatingSystemCommand.length)
      if (commandEnd < 0) {
        if (this.buffer.length > 16) this.buffer = this.buffer.slice(operatingSystemCommand.length)
        break
      }

      const payloadStart = commandEnd + 1
      const terminator = findSequenceTerminator(this.buffer, payloadStart)
      if (!terminator) {
        if (this.buffer.length > maximumBufferedSequenceLength) {
          this.buffer = this.buffer.slice(operatingSystemCommand.length)
          continue
        }
        break
      }

      const command = this.buffer.slice(operatingSystemCommand.length, commandEnd)
      const payload = this.buffer.slice(payloadStart, terminator.index)
      this.buffer = this.buffer.slice(terminator.index + terminator.length)
      if ((command === '0' || command === '2') && isSafeTerminalTitle(payload)) {
        titles.push(payload)
      }
    }

    return titles
  }
}

function findSequenceTerminator(
  input: string,
  payloadStart: number
): { readonly index: number; readonly length: number } | null {
  const bellIndex = input.indexOf(bell, payloadStart)
  const stringTerminatorIndex = input.indexOf(stringTerminator, payloadStart)
  if (bellIndex < 0 && stringTerminatorIndex < 0) return null
  if (bellIndex >= 0 && (stringTerminatorIndex < 0 || bellIndex < stringTerminatorIndex)) {
    return { index: bellIndex, length: bell.length }
  }
  return { index: stringTerminatorIndex, length: stringTerminator.length }
}

function isSafeTerminalTitle(value: string): boolean {
  if (!value || value.length > maximumBufferedSequenceLength) return false
  return [...value].every((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint >= 0x20 && codePoint !== 0x7f && codePoint !== 0x9b && codePoint !== 0x9d
  })
}
