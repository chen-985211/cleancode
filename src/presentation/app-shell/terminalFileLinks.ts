export interface TerminalFileLinkCandidate {
  readonly startIndex: number
  readonly text: string
}

const localPathPattern =
  /(?:^|[\s("'`])((?:\.{1,2}\/|\/)[^\s"'`<>]+|[\w@.+-]+(?:\/[\w@.+-]+)+(?::\d+(?::\d+)?)?)/gu

export function findTerminalFileLinkCandidates(line: string): TerminalFileLinkCandidate[] {
  const candidates: TerminalFileLinkCandidate[] = []
  for (const match of line.matchAll(localPathPattern)) {
    const text = trimTrailingPunctuation(match[1] ?? '')
    if (!text || text.includes('://')) continue
    const matchText = match[0] ?? ''
    const prefixLength = matchText.length - (match[1]?.length ?? 0)
    candidates.push({ startIndex: (match.index ?? 0) + prefixLength, text })
  }
  return candidates
}

export function createTerminalFileLinkProvider(
  terminal: XTerm,
  onActivate: (target: string) => void
): ILinkProvider {
  return {
    provideLinks: (bufferLineNumber, callback) => {
      const line = terminal.buffer.active.getLine(bufferLineNumber - 1)
      if (!line) {
        callback(undefined)
        return
      }
      const candidates = findTerminalFileLinkCandidates(line.translateToString(true))
      const links = candidates.flatMap((candidate) => {
        const startX = mapStringIndexToCell(line, candidate.startIndex)
        const endX = mapStringIndexToCell(
          line,
          candidate.startIndex + Math.max(0, candidate.text.length - 1)
        )
        if (startX === null || endX === null) return []
        return [
          {
            activate: (event: MouseEvent, text: string) => {
              if (hasOpenModifier(event)) onActivate(text)
            },
            decorations: { pointerCursor: true, underline: true },
            range: {
              start: { x: startX, y: bufferLineNumber },
              end: { x: endX, y: bufferLineNumber }
            },
            text: candidate.text
          } satisfies ILink
        ]
      })
      callback(links.length > 0 ? links : undefined)
    }
  }
}

export function hasOpenModifier(event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.metaKey || event.ctrlKey
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[),.;]+$/u, '')
}

function mapStringIndexToCell(line: IBufferLine, targetIndex: number): number | null {
  let stringIndex = 0
  for (let cellIndex = 0; cellIndex < line.length; cellIndex += 1) {
    const cell = line.getCell(cellIndex)
    if (!cell || cell.getWidth() === 0) continue
    const cellTextLength = cell.getChars().length || 1
    if (targetIndex < stringIndex + cellTextLength) return cellIndex + 1
    stringIndex += cellTextLength
  }
  return null
}
import type { IBufferLine, ILink, ILinkProvider, Terminal as XTerm } from '@xterm/xterm'
