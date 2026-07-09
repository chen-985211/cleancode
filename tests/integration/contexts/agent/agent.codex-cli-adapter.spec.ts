import {
  NodeCodexCliAdapter,
  type CodexCliCommandRunner
} from '../../../../src/contexts/agent/infrastructure/cli/NodeCodexCliAdapter'

describe('Codex CLI adapter', () => {
  it('detects an installed Codex CLI version from command output', async () => {
    const adapter = new NodeCodexCliAdapter(createCommandRunner('codex-cli 0.143.0\n'))

    await expect(adapter.inspect()).resolves.toEqual({
      installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      status: 'installed',
      version: 'codex-cli 0.143.0'
    })
  })

  it('returns the install command when the Codex CLI command is unavailable', async () => {
    const adapter = new NodeCodexCliAdapter(async () => Promise.reject(new Error('missing codex')))

    await expect(adapter.inspect()).resolves.toEqual({
      installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      status: 'missing',
      version: null
    })
  })
})

function createCommandRunner(stdout: string): CodexCliCommandRunner {
  return async () => ({ stdout })
}
