import {
  TerminalPasteController,
  analyzeTerminalPaste,
  quoteTerminalFilePaths,
  splitTerminalPasteChunks
} from '../../../../src/contexts/run/presentation/terminal-surface/terminalPaste'

describe('terminal paste', () => {
  it('splits on Unicode boundaries without exceeding the UTF-8 chunk budget', () => {
    const chunks = splitTerminalPasteChunks('ab界🙂cd', 5)

    expect(chunks.join('')).toBe('ab界🙂cd')
    expect(chunks.every((chunk) => new TextEncoder().encode(chunk).byteLength <= 5)).toBe(true)
  })

  it('detects high-risk controls and enforces the total byte cap', () => {
    expect(analyzeTerminalPaste('safe\ntext')).toMatchObject({ highRisk: false, accepted: true })
    expect(analyzeTerminalPaste('rm -rf /\u001b[2J')).toMatchObject({
      highRisk: true,
      accepted: true
    })
    expect(analyzeTerminalPaste('x'.repeat(1024 * 1024 + 1))).toMatchObject({ accepted: false })
  })

  it('always closes bracketed paste mode when a queued paste is cancelled', async () => {
    const writes: string[] = []
    const controller = new TerminalPasteController({
      chunkBytes: 4,
      write: async (chunk) => {
        writes.push(chunk)
        if (chunk === 'abcd') controller.cancel()
      }
    })

    await controller.paste('abcdef', { bracketedPasteMode: true })

    expect(writes).toEqual(['\u001b[200~', 'abcd', '\u001b[201~'])
  })

  it('cancels a superseded request before it writes any bytes', async () => {
    const writes: string[] = []
    const controller = new TerminalPasteController({
      write: async (chunk) => {
        writes.push(chunk)
      }
    })

    const first = controller.paste('first', { bracketedPasteMode: true })
    const second = controller.paste('second', { bracketedPasteMode: false })
    await Promise.all([first, second])

    expect(writes).toEqual(['second'])
  })

  it('quotes file paths as inert shell arguments', () => {
    expect(quoteTerminalFilePaths(['/work/a b.txt', "/work/it's.txt"])).toBe(
      "'/work/a b.txt' '/work/it'\\''s.txt'"
    )
  })
})
