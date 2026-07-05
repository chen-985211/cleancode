export const terminalOutputTailMaxCharacters = 8192

export function appendTerminalOutputTail(currentTail: string, output: string): string {
  const nextTail = `${currentTail}${output}`

  if (nextTail.length <= terminalOutputTailMaxCharacters) {
    return nextTail
  }

  return nextTail.slice(nextTail.length - terminalOutputTailMaxCharacters)
}
