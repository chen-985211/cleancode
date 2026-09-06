import { projectCodexServerArguments } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexNativeMessageLaunch'

describe('Codex native message launch configuration', () => {
  it('preserves explicit settings on the owned server without reinterpreting TUI permissions', () => {
    expect(
      projectCodexServerArguments([
        '-c',
        'model_provider="custom"',
        '--enable',
        'feature',
        '--dangerously-bypass-approvals-and-sandbox',
        '-m',
        'model',
        '-a',
        'never',
        '--add-dir',
        '/extra'
      ])
    ).toEqual(['-c', 'model_provider="custom"', '--enable', 'feature'])
  })
  it.each([
    ['--remote', 'unix://external'],
    ['--profile', 'custom'],
    ['--oss'],
    ['--unknown-flag']
  ])('keeps unsupported launch options on the original native path: %s', (...args) => {
    expect(projectCodexServerArguments(args)).toBeNull()
  })
})
