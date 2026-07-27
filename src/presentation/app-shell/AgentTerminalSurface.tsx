import type { KeyboardEvent, MutableRefObject } from 'react'

import type { AgentSessionSnapshot } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import { useI18n } from './i18n/useI18n'
import { TerminalThemeProjection } from './TerminalThemeProjection'

export function AgentTerminalSurface({
  activeOutput,
  providerName,
  terminalElementRef,
  onFallbackInput,
  session,
  useFallback,
  workspaceDisplayName
}: {
  readonly activeOutput: string
  readonly providerName: string
  readonly terminalElementRef: MutableRefObject<HTMLDivElement | null>
  readonly onFallbackInput: (input: string) => void
  readonly session: AgentSessionSnapshot | null
  readonly useFallback: boolean
  readonly workspaceDisplayName?: string
}) {
  const { t } = useI18n()
  if (useFallback) {
    return (
      <div className="agent-terminal-fallback">
        <pre aria-label={t('agent.cliTerminal', { provider: providerName })}>{activeOutput}</pre>
        <textarea
          aria-label={t('agent.cliInput', { provider: providerName })}
          onChange={(event) => {
            onFallbackInput(event.target.value)
            event.target.value = ''
          }}
        />
      </div>
    )
  }

  return (
    <TerminalThemeProjection
      className="agent-terminal-frame nodrag nopan nowheel"
      sourceTheme={session?.terminalSourceTheme}
    >
      <div
        className="agent-terminal-viewport nodrag nopan nowheel"
        data-agent-terminal-agent-id={session?.agentId}
        data-agent-terminal-output-length={activeOutput.length}
        data-agent-terminal-process-id={session?.runtime.terminal.processId ?? undefined}
        data-agent-terminal-session-id={session?.sessionId}
        data-agent-terminal-source-theme={session?.terminalSourceTheme}
        data-agent-terminal-workspace-id={session?.workspaceId}
        data-agent-terminal-workspace-name={workspaceDisplayName}
        onKeyDownCapture={preserveWindowsTextPaste}
        ref={terminalElementRef}
      />
    </TerminalThemeProjection>
  )
}

function preserveWindowsTextPaste(event: KeyboardEvent<HTMLDivElement>): void {
  if (
    /^Win/iu.test(navigator.platform) &&
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'v'
  ) {
    event.stopPropagation()
  }
}
