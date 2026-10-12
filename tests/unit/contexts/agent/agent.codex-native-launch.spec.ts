import { projectCodexServerArguments } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexNativeMessageLaunch'

describe('Codex native message launch configuration', () => {
  it.each([
    ['--dangerously-bypass-approvals-and-sandbox'],
    ['--approve-for-me'],
    ['--sandbox', 'read-only'],
    ['-s', 'workspace-write'],
    ['--ask-for-approval', 'on-request'],
    ['-a', 'never'],
    ['--add-dir', '/extra'],
    ['-c', 'approval_policy="never"'],
    ['--config', 'approvals_reviewer="auto_review"'],
    ['-c', 'sandbox_mode="read-only"'],
    ['-c', 'sandbox_workspace_write.writable_roots=["/extra"]'],
    ['-c', 'default_permissions="read-only"'],
    ['-c', 'permissions.custom.filesystem={read=["/extra"]}'],
    ['-c', 'network.allowed_domains=["example.com"]'],
    ['-c', ' "sandbox_mode" = "read-only"'],
    ['-c', "'approval_policy' = 'never'"]
  ])('retains permission overrides on the ordinary resume path: %s', (...args) => {
    expect(projectCodexServerArguments(args, true)).toBeNull()
    expect(projectCodexServerArguments(args, false)).not.toBeNull()
  })

  it('keeps remote resume for model and presentation settings without permission overrides', () => {
    expect(
      projectCodexServerArguments(
        [
          '-m',
          'resume',
          '-c',
          'model_provider="custom"',
          '-c',
          'developer_instructions="resume --sandbox read-only"',
          '--no-alt-screen'
        ],
        true
      )
    ).toEqual([
      '-c',
      'model_provider="custom"',
      '-c',
      'developer_instructions="resume --sandbox read-only"'
    ])
  })

  it.each(['"\\u0073andbox_mode"="read-only"', 'not a config assignment'])(
    'keeps unclassified resume configuration on the original path: %s',
    (value) => {
      expect(projectCodexServerArguments(['-c', value], true)).toBeNull()
    }
  )

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
