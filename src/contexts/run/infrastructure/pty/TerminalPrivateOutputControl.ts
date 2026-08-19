const outputControlMarkerPrefix = '\u001b]633;CLEANCODE_OUTPUT_CONTROL:'
const outputControlMarkerEnd = '\u0007'
const maximumPrivateOutputLength = 4096
const outputControlTokenPattern = /^[A-Za-z0-9_-]{16,128}$/

type TerminalPrivateOutputPhase = 'visible' | 'private' | 'failed-open'

export interface TerminalPrivateOutputControlDescriptor {
  readonly token: string
}

export interface TerminalPrivateOutputControl {
  readonly token: string
  phase: TerminalPrivateOutputPhase
  pending: string
}

export function isTerminalPrivateOutputControlToken(value: unknown): value is string {
  return typeof value === 'string' && outputControlTokenPattern.test(value)
}

export function createTerminalPrivateOutputControl(
  descriptor: TerminalPrivateOutputControlDescriptor
): TerminalPrivateOutputControl {
  return {
    pending: '',
    phase: 'visible',
    token: descriptor.token
  }
}

export function acceptTerminalPrivateOutput(
  control: TerminalPrivateOutputControl,
  data: string
): string {
  const beginMarker = createMarker(control.token, 'begin')
  const endMarker = createMarker(control.token, 'end')
  let input = control.pending + data
  let output = ''
  control.pending = ''

  while (input) {
    if (control.phase === 'visible') {
      const markerIndex = input.indexOf(beginMarker)
      if (markerIndex >= 0) {
        output += input.slice(0, markerIndex)
        input = input.slice(markerIndex + beginMarker.length)
        control.phase = 'private'
        continue
      }

      const retainedLength = longestSuffixPrefix(input, beginMarker)
      output += input.slice(0, input.length - retainedLength)
      control.pending = input.slice(input.length - retainedLength)
      break
    }

    if (control.phase === 'private') {
      const markerIndex = input.indexOf(endMarker)
      if (markerIndex >= 0) {
        const cycleEnd = markerIndex + endMarker.length
        if (markerIndex > maximumPrivateOutputLength) {
          output += beginMarker + input.slice(0, cycleEnd)
        }
        input = input.slice(cycleEnd)
        control.phase = 'visible'
        continue
      }

      const retainedLength = longestSuffixPrefix(input, endMarker)
      const confirmedLength = input.length - retainedLength
      if (confirmedLength > maximumPrivateOutputLength) {
        output += beginMarker + input.slice(0, confirmedLength)
        control.pending = input.slice(confirmedLength)
        control.phase = 'failed-open'
      } else {
        control.pending = input
      }
      break
    }

    const markerIndex = input.indexOf(endMarker)
    if (markerIndex >= 0) {
      const cycleEnd = markerIndex + endMarker.length
      output += input.slice(0, cycleEnd)
      input = input.slice(cycleEnd)
      control.phase = 'visible'
      continue
    }

    const retainedLength = longestSuffixPrefix(input, endMarker)
    output += input.slice(0, input.length - retainedLength)
    control.pending = input.slice(input.length - retainedLength)
    break
  }

  return output
}

export function flushTerminalPrivateOutput(control: TerminalPrivateOutputControl): string {
  const output =
    control.phase === 'private'
      ? createMarker(control.token, 'begin') + control.pending
      : control.pending
  control.pending = ''
  control.phase = 'visible'
  return output
}

function createMarker(token: string, phase: 'begin' | 'end'): string {
  return `${outputControlMarkerPrefix}${token}:${phase}${outputControlMarkerEnd}`
}

function longestSuffixPrefix(value: string, prefix: string): number {
  const maximum = Math.min(value.length, prefix.length - 1)
  for (let length = maximum; length > 0; length -= 1) {
    if (value.endsWith(prefix.slice(0, length))) return length
  }
  return 0
}
