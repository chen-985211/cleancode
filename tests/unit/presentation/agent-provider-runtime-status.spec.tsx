import { render, screen } from '@testing-library/react'

import type { AgentRuntimeSnapshot } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import { AgentProviderStatusView } from '../../../src/presentation/app-shell/AgentProviderStatusView'

describe('Agent Provider runtime status', () => {
  it.each(['initial', 'new', 'retry'] as const)(
    'keeps a normal %s Agent attachment quiet',
    (mode) => {
      render(
        <AgentProviderStatusView
          attachment={{ mode, status: 'pending' }}
          onRetryInspection={vi.fn()}
          providerName="Codex"
          runtime={null}
          state={{
            availability: {
              providerId: 'codex',
              status: 'installed',
              version: '1.0.0'
            },
            status: 'ready'
          }}
        />
      )

      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    }
  )

  it.each([
    [
      'MCP failure',
      runtime({ launch: 'running', mcp: 'failed' }),
      'CleanCode MCP 当前不可用，Agent 仍可使用基础终端能力'
    ],
    [
      'binding persistence failure',
      runtime({ binding: 'persistence_failed', launch: 'running', mcp: 'ready' }),
      '对话仍可继续，但未能保存恢复信息'
    ]
  ] as const)('projects %s independently', (_name, currentRuntime, message) => {
    render(
      <AgentProviderStatusView
        onRetryInspection={vi.fn()}
        providerName="OpenCode"
        runtime={currentRuntime}
        state={{ status: 'unavailable' }}
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent(message)
  })

  it.each(['launching', 'running'] as const)(
    'keeps normal MCP initialization quiet while the Provider launch is %s',
    (launch) => {
      render(
        <AgentProviderStatusView
          onRetryInspection={vi.fn()}
          providerName="Claude Code"
          runtime={runtime({ launch, mcp: 'initializing' })}
          state={{ status: 'unavailable' }}
        />
      )

      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    }
  )

  it.each([
    [null, '请将 Claude Code CLI 更新到 2.1.119 或更高版本'],
    [
      {
        ...runtime({ launch: 'failed', mcp: 'inactive' }),
        terminal: {
          ...runtime({ launch: 'failed', mcp: 'inactive' }).terminal,
          processId: null,
          status: 'failed' as const
        }
      },
      'Claude Code 无法启动，需要 2.1.119 或更高版本'
    ]
  ])('shows an actionable compatibility warning for runtime %j', (currentRuntime, message) => {
    render(
      <AgentProviderStatusView
        onRetryInspection={vi.fn()}
        providerName="Claude Code"
        runtime={currentRuntime}
        state={{
          availability: {
            installCommand: 'install claude',
            minimumVersion: '2.1.119',
            providerId: 'claude-code',
            status: 'upgrade_required',
            version: '2.1.118'
          },
          status: 'ready'
        }}
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent(message)
  })
})

function runtime(input: {
  readonly binding?: AgentRuntimeSnapshot['binding']['status']
  readonly launch: AgentRuntimeSnapshot['launch']['status']
  readonly mcp: AgentRuntimeSnapshot['mcp']['status']
}): AgentRuntimeSnapshot {
  return {
    activity: { status: 'unavailable' },
    binding: { status: input.binding ?? 'persisted' },
    launch: {
      exitCode: null,
      failureKind: null,
      generation: 1,
      launchId: 'launch-1',
      status: input.launch
    },
    mcp: { status: input.mcp },
    revision: 1,
    terminal: {
      exitCode: null,
      processId: 42,
      status: 'running',
      viewIdentity: null
    }
  }
}
