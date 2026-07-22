import { claudeCodeInstallCommands } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'
import { codexInstallCommands } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'
import { openCodeInstallCommands } from '../../../../src/contexts/agent/infrastructure/providers/opencode/OpenCodeAgentProviderContribution'
import { resolveAgentProviderInstallCommand } from '../../../../src/contexts/agent/infrastructure/providers/shared/AgentProviderInstallation'

describe('Agent Provider installation recipes', () => {
  it.each([
    ['Codex', codexInstallCommands],
    ['Claude Code', claudeCodeInstallCommands],
    ['OpenCode', openCodeInstallCommands]
  ] as const)('provides one command for every supported host for %s', (_name, commands) => {
    expect(resolveAgentProviderInstallCommand(commands, 'darwin')).toBe(commands.macos)
    expect(resolveAgentProviderInstallCommand(commands, 'linux')).toBe(commands.linux)
    expect(resolveAgentProviderInstallCommand(commands, 'win32')).toBe(commands.windows)
  })

  it('uses the POSIX recipe for other Node platforms', () => {
    expect(resolveAgentProviderInstallCommand(openCodeInstallCommands, 'freebsd')).toBe(
      openCodeInstallCommands.linux
    )
  })
})
