import type { AgentRuntimeSnapshot } from '../../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import { deriveAgentProviderFeedback } from '../../../../src/contexts/agent/presentation/view-models/agentProviderFeedback'

describe('Agent Provider feedback policy', () => {
  it.each([
    ['disabled', null],
    ['unsupported', null],
    ['inactive', 'connecting'],
    ['initializing', 'connecting'],
    ['ready', 'ready'],
    ['degraded', 'degraded'],
    ['failed', 'unavailable']
  ] as const)('projects MCP %s as %s', (mcp, expected) => {
    const feedback = deriveAgentProviderFeedback({
      attachment: { status: 'idle' },
      runtime: runtime({ mcp }),
      state: installedState
    })

    expect(feedback.mcpStatus).toBe(expected)
  })

  it('keeps a passive MCP failure on the MCP control without interrupting the user', () => {
    const feedback = deriveAgentProviderFeedback({
      attachment: { status: 'idle' },
      runtime: runtime({ mcp: 'failed' }),
      state: installedState
    })

    expect(feedback.events).toEqual([])
    expect(feedback.blocking).toBeNull()
  })

  it('aggregates independent persistent Agent issues without hiding one behind another', () => {
    const feedback = deriveAgentProviderFeedback({
      attachment: { mode: 'retry', status: 'failed' },
      runtime: runtime({
        binding: 'persistence_failed',
        launch: 'exited',
        mcp: 'ready'
      }),
      state: installedState
    })

    expect(feedback.issues).toEqual(['attachment_failed', 'session_ended', 'binding_save_failed'])
  })

  it.each([
    ['Provider CLI exit', 'exited', 'running', null],
    ['terminal start failure', 'not_started', 'failed', null],
    ['launch failure', 'failed', 'running', null],
    ['unexpected PTY termination', 'stopped', 'exited', 'unexpected']
  ] as const)(
    'never notifies about %s because the header status entry already owns it',
    (_scenario, launch, terminal, stopReason) => {
      const feedback = deriveAgentProviderFeedback({
        attachment: { status: 'idle' },
        runtime: runtime({ launch, mcp: 'inactive', stopReason, terminal }),
        state: installedState
      })

      expect(feedback.events).toEqual([])
      expect(feedback.issues).not.toEqual([])
    }
  )

  it.each([
    ['Agent removal'],
    ['CleanCode MCP capability toggle'],
    ['workspace ownership handover'],
    ['application quit']
  ] as const)('stays completely quiet after a stop the user requested for %s', () => {
    const feedback = deriveAgentProviderFeedback({
      attachment: { status: 'idle' },
      runtime: runtime({
        launch: 'stopped',
        mcp: 'inactive',
        stopReason: 'requested',
        terminal: 'exited'
      }),
      state: installedState
    })

    expect(feedback).toEqual({ blocking: null, events: [], issues: [], mcpStatus: 'connecting' })
  })

  it('notifies about binding persistence but keeps MCP readiness on its own control', () => {
    expect(
      deriveAgentProviderFeedback({
        attachment: { status: 'idle' },
        runtime: runtime({ binding: 'persistence_failed', mcp: 'failed' }),
        state: installedState
      }).events
    ).toEqual(['binding_save_failed'])
  })

  it('separates a terminal that never started from a session that was interrupted', () => {
    expect(
      deriveAgentProviderFeedback({
        attachment: { status: 'idle' },
        runtime: runtime({ launch: 'not_started', mcp: 'inactive', terminal: 'failed' }),
        state: installedState
      }).issues
    ).toEqual(['terminal_failed'])

    expect(
      deriveAgentProviderFeedback({
        attachment: { status: 'idle' },
        runtime: runtime({
          launch: 'stopped',
          mcp: 'inactive',
          stopReason: 'unexpected',
          terminal: 'exited'
        }),
        state: installedState
      }).issues
    ).toEqual(['session_interrupted'])
  })

  it('uses the terminal empty state only when there is no usable runtime', () => {
    expect(
      deriveAgentProviderFeedback({
        attachment: { status: 'idle' },
        runtime: null,
        state: {
          availability: {
            providerId: 'example',
            reason: 'not_found',
            status: 'missing',
            version: null
          },
          status: 'ready'
        }
      }).blocking
    ).toBe('provider_missing')

    const feedback = deriveAgentProviderFeedback({
      attachment: { status: 'idle' },
      runtime: runtime({ launch: 'failed', mcp: 'inactive' }),
      state: installedState
    })
    expect(feedback.blocking).toBeNull()
    expect(feedback.issues).toContain('start_failed')
  })

  it('keeps an attachment failure out of the notification channel', () => {
    const feedback = deriveAgentProviderFeedback({
      attachment: { mode: 'initial', status: 'failed' },
      runtime: runtime({ mcp: 'ready' }),
      state: installedState
    })

    expect(feedback.issues).toContain('attachment_failed')
    expect(feedback.events).toEqual([])
  })

  it('keeps normal attachment and short Provider inspection quiet', () => {
    expect(
      deriveAgentProviderFeedback({
        attachment: { mode: 'initial', status: 'pending' },
        runtime: null,
        state: { status: 'checking', visible: false }
      })
    ).toEqual({
      blocking: null,
      events: [],
      issues: [],
      mcpStatus: null
    })
  })
})

const installedState = {
  availability: {
    providerId: 'example',
    status: 'installed' as const,
    version: '1.0.0'
  },
  status: 'ready' as const
}

function runtime(input: {
  readonly binding?: AgentRuntimeSnapshot['binding']['status']
  readonly launch?: AgentRuntimeSnapshot['launch']['status']
  readonly mcp: AgentRuntimeSnapshot['mcp']['status']
  readonly stopReason?: AgentRuntimeSnapshot['terminal']['stopReason']
  readonly terminal?: AgentRuntimeSnapshot['terminal']['status']
}): AgentRuntimeSnapshot {
  return {
    activity: { status: 'unavailable' },
    binding: { status: input.binding ?? 'persisted' },
    launch: {
      exitCode: null,
      failureKind: input.launch === 'failed' ? 'start' : null,
      generation: 1,
      launchId: 'launch-1',
      status: input.launch ?? 'running'
    },
    mcp: { status: input.mcp },
    revision: 1,
    terminal: {
      exitCode: null,
      processId: input.terminal && input.terminal !== 'running' ? null : 42,
      status: input.terminal ?? 'running',
      stopReason: input.stopReason ?? null,
      viewIdentity: null
    }
  }
}
