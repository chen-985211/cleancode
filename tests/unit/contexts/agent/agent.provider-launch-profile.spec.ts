import {
  resolveAgentProviderLaunchProfile,
  tokenizeAgentArguments
} from '../../../../src/contexts/agent/application/services/AgentProviderLaunchProfileResolver'
import type { AgentProviderLaunchConfiguration } from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'

const codex: AgentProviderLaunchConfiguration = {
  defaultArguments: [],
  defaultEnvironment: {},
  executable: 'codex',
  permission: {
    arguments: ['--dangerously-bypass-approvals-and-sandbox']
  }
}

describe('Agent Provider launch profile resolver', () => {
  it('applies known Yolo arguments by default', () => {
    expect(
      resolveAgentProviderLaunchProfile({
        configuration: codex,
        override: undefined,
        permissionMode: 'yolo'
      })
    ).toEqual({
      arguments: ['--dangerously-bypass-approvals-and-sandbox'],
      environment: {},
      executable: 'codex'
    })
  })

  it('keeps Provider defaults, user arguments, and environment overrides separated', () => {
    expect(
      resolveAgentProviderLaunchProfile({
        configuration: {
          defaultArguments: ['chat', '--tui'],
          defaultEnvironment: { BUILTIN: '1' },
          executable: 'kiro-cli',
          permission: { arguments: ['--trust-all-tools'], environment: { TRUST: 'all' } }
        },
        override: {
          argumentsText: '--model "fast model"',
          environment: { BUILTIN: '2', USER_SETTING: 'yes' },
          executable: '/opt/kiro-cli'
        },
        permissionMode: 'yolo'
      })
    ).toEqual({
      arguments: ['chat', '--tui', '--trust-all-tools', '--model', 'fast model'],
      environment: { BUILTIN: '2', TRUST: 'all', USER_SETTING: 'yes' },
      executable: '/opt/kiro-cli'
    })
  })

  it('removes only managed permission defaults in manual mode', () => {
    expect(
      resolveAgentProviderLaunchProfile({
        configuration: {
          defaultArguments: ['--interactive'],
          defaultEnvironment: { BASE: '1' },
          executable: 'goose',
          permission: { environment: { GOOSE_MODE: 'auto' } }
        },
        override: {
          argumentsText: '--dangerously-custom',
          environment: { CUSTOM: '1' },
          executable: undefined
        },
        permissionMode: 'manual'
      })
    ).toEqual({
      arguments: ['--interactive', '--dangerously-custom'],
      environment: { BASE: '1', CUSTOM: '1' },
      executable: 'goose'
    })
  })

  it('tokenizes quoted arguments and rejects unclosed quotes', () => {
    expect(tokenizeAgentArguments(`--model "fast model" --label 'review agent'`)).toEqual({
      ok: true,
      tokens: ['--model', 'fast model', '--label', 'review agent']
    })
    expect(tokenizeAgentArguments(`--model "fast model`)).toEqual({
      error: 'UNCLOSED_QUOTE',
      ok: false
    })
  })
})
