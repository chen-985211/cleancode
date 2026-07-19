import type { MutableRefObject } from 'react'

import type { AgentSessionSnapshot } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import { useI18n } from './i18n/useI18n'

export function AgentTerminalSurface({
  activeOutput,
  terminalElementRef,
  onFallbackInput,
  session,
  useFallback
}: {
  readonly activeOutput: string
  readonly terminalElementRef: MutableRefObject<HTMLDivElement | null>
  readonly onFallbackInput: (input: string) => void
  readonly session: AgentSessionSnapshot | null
  readonly useFallback: boolean
}) {
  const { t } = useI18n()
  if (useFallback) {
    return (
      <div className="agent-terminal-fallback">
        <pre aria-label={t('agent.cliTerminal')}>{activeOutput}</pre>
        <textarea
          aria-label={t('agent.cliInput')}
          onChange={(event) => {
            onFallbackInput(event.target.value)
            event.target.value = ''
          }}
        />
      </div>
    )
  }

  return (
    <div className="agent-terminal-frame nodrag nopan nowheel">
      <div
        className="agent-terminal-viewport nodrag nopan nowheel"
        data-agent-terminal-agent-id={session?.agentId}
        data-agent-terminal-output-length={activeOutput.length}
        data-agent-terminal-process-id={session?.processId ?? undefined}
        data-agent-terminal-session-id={session?.sessionId}
        data-agent-terminal-workspace-name={session?.workspaceName}
        ref={terminalElementRef}
      />
    </div>
  )
}
