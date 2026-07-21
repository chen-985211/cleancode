import { findTerminalFileLinkCandidates } from '../../../src/presentation/app-shell/terminalFileLinks'

describe('terminal file link recognition', () => {
  it('recognizes workspace-style paths with optional line and column suffixes', () => {
    expect(findTerminalFileLinkCandidates('at src/example.ts:12:4 and ./README.md:9')).toEqual([
      { startIndex: 3, text: 'src/example.ts:12:4' },
      { startIndex: 27, text: './README.md:9' }
    ])
  })

  it('does not turn URLs, flags, or plain words into local path candidates', () => {
    expect(
      findTerminalFileLinkCandidates('https://example.com/a.ts --config option package.json')
    ).toEqual([])
  })
})
