export const terminalOutputTailMaxCharacters = 8192

export function appendTerminalOutputTail(currentTail: string, output: string): string {
  const nextTail = `${currentTail}${output}`

  if (nextTail.length <= terminalOutputTailMaxCharacters) {
    return nextTail
  }

  return nextTail.slice(nextTail.length - terminalOutputTailMaxCharacters)
}

export function appendTerminalOutputForSession(
  outputBySession: Map<string, string>,
  event: { readonly data: string; readonly sessionId: string }
): string {
  const nextOutput = appendTerminalOutputTail(
    outputBySession.get(event.sessionId) ?? '',
    event.data
  )

  outputBySession.set(event.sessionId, nextOutput)
  return nextOutput
}
