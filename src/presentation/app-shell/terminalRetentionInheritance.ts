import type { TerminalSessionSnapshot } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalViewState } from './types'

export function shouldInheritTerminalRetention(state: TerminalViewState | undefined): boolean {
  return (
    state?.status === 'running' &&
    state.sessionKind != null &&
    state.sessionKind !== 'workflow' &&
    state.retentionPolicy === 'keep-after-application-exit'
  )
}

export async function inheritTerminalRetention(
  session: TerminalSessionSnapshot,
  shouldInherit: boolean,
  onFailure: (error: unknown) => void
): Promise<TerminalSessionSnapshot> {
  if (!shouldInherit || session.kind !== 'direct' || !window.cleancode?.setTerminalRetention) {
    return session
  }

  try {
    return await window.cleancode.setTerminalRetention({
      sessionId: session.id,
      retentionPolicy: 'keep-after-application-exit'
    })
  } catch (error) {
    onFailure(error)
    return session
  }
}
