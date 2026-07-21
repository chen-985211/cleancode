import {
  encodeTerminalProviderFrame,
  TerminalProviderFrameDecoder,
  terminalProviderMaxFrameBytes
} from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'

describe('terminal provider protocol', () => {
  it('decodes split and coalesced length-prefixed JSON frames', () => {
    const first = encodeTerminalProviderFrame({ requestId: 'one', method: 'health' })
    const second = encodeTerminalProviderFrame({ requestId: 'two', method: 'list' })
    const wire = Buffer.concat([first, second])
    const decoder = new TerminalProviderFrameDecoder()

    expect(decoder.push(wire.subarray(0, 3))).toEqual([])
    expect(decoder.push(wire.subarray(3, first.length + 2))).toEqual([
      { requestId: 'one', method: 'health' }
    ])
    expect(decoder.push(wire.subarray(first.length + 2))).toEqual([
      { requestId: 'two', method: 'list' }
    ])
  })

  it('rejects frames over the protocol budget before allocating their payload', () => {
    const header = Buffer.alloc(4)
    header.writeUInt32BE(terminalProviderMaxFrameBytes + 1)
    const decoder = new TerminalProviderFrameDecoder()

    expect(() => decoder.push(header)).toThrow('Terminal provider frame exceeds the limit.')
  })

  it('rejects malformed JSON without accepting a partial message', () => {
    const payload = Buffer.from('{broken', 'utf8')
    const frame = Buffer.alloc(4 + payload.length)
    frame.writeUInt32BE(payload.length)
    payload.copy(frame, 4)

    expect(() => new TerminalProviderFrameDecoder().push(frame)).toThrow(
      'Terminal provider frame contains invalid JSON.'
    )
  })
})
