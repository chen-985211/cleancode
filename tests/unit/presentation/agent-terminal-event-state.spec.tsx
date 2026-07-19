import { act, render, screen } from '@testing-library/react'

import type {
  AgentPtyExitEvent,
  AgentPtyOutputEvent
} from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import {
  useAgentTerminalEvents,
  useAgentTerminalOutput
} from '../../../src/presentation/app-shell/useAgentTerminalEvents'
import { AgentTerminalEventProvider } from '../../../src/presentation/app-shell/AgentTerminalEventProvider'
import { createRuntimeApi } from '../../fixtures/presentation/appShellFixtures'

describe('Agent terminal event state', () => {
  afterEach(() => Reflect.deleteProperty(window, 'cleancode'))

  it('preserves session output and exit facts while the current Agent console is unmounted', () => {
    let exitListener: (event: AgentPtyExitEvent) => void = () => undefined
    let outputListener: (event: AgentPtyOutputEvent) => void = () => undefined
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        onAgentPtyExit: vi.fn((listener) => {
          exitListener = listener
          return vi.fn()
        }),
        onAgentPtyOutput: vi.fn((listener) => {
          outputListener = listener
          return vi.fn()
        })
      })
    })
    const view = render(
      <AgentTerminalEventProvider>
        <OutputReader sessionId="agent-main" />
      </AgentTerminalEventProvider>
    )

    act(() => {
      outputListener({ agentId: 'agent-1', data: 'MAIN_READY', sessionId: 'agent-main' })
    })
    expect(screen.getByTestId('agent-output')).toHaveTextContent('MAIN_READY')

    view.rerender(<AgentTerminalEventProvider>{null}</AgentTerminalEventProvider>)
    act(() => {
      exitListener({ agentId: 'agent-1', exitCode: 0, sessionId: 'agent-main' })
    })
    view.rerender(
      <AgentTerminalEventProvider>
        <OutputReader sessionId="agent-main" />
        <ExitReader sessionId="agent-main" />
      </AgentTerminalEventProvider>
    )

    expect(screen.getByTestId('agent-output')).toHaveTextContent('MAIN_READY')
    expect(screen.getByTestId('agent-exit')).toHaveTextContent('exited')
  })
})

function OutputReader({ sessionId }: { readonly sessionId: string }) {
  const output = useAgentTerminalOutput(sessionId)

  return <div data-testid="agent-output">{output}</div>
}

function ExitReader({ sessionId }: { readonly sessionId: string }) {
  const events = useAgentTerminalEvents()

  return (
    <div data-testid="agent-exit">
      {events.exitedSessionIds.has(sessionId) ? 'exited' : 'running'}
    </div>
  )
}
