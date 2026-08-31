export const terminalSurfaceAttachedSessionIdAttribute = 'data-terminal-attached-session-id'

export function bindTerminalSurfaceAttachmentIdentity(
  element: HTMLElement,
  sessionId: string | null
): () => void {
  const attachedSessionId = sessionId && sessionId.length > 0 ? sessionId : null

  if (attachedSessionId) {
    element.setAttribute(terminalSurfaceAttachedSessionIdAttribute, attachedSessionId)
  } else {
    element.removeAttribute(terminalSurfaceAttachedSessionIdAttribute)
  }

  return () => {
    if (
      attachedSessionId &&
      element.getAttribute(terminalSurfaceAttachedSessionIdAttribute) === attachedSessionId
    ) {
      element.removeAttribute(terminalSurfaceAttachedSessionIdAttribute)
    }
  }
}
