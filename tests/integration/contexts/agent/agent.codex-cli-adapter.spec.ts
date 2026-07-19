import {
  NodeCodexCliAdapter,
  type CodexCliCommandRunner
} from '../../../../src/contexts/agent/infrastructure/cli/NodeCodexCliAdapter'

describe('Codex CLI adapter', () => {
  it('detects an installed Codex CLI version from command output', async () => {
    const adapter = new NodeCodexCliAdapter(createCommandRunner('codex-cli 0.143.0\n'))

    await expect(adapter.inspect()).resolves.toEqual({
      status: 'installed',
      version: 'codex-cli 0.143.0'
    })
  })

  it('returns the install command only when the Codex CLI executable is not found', async () => {
    const adapter = new NodeCodexCliAdapter(async () =>
      Promise.reject(createCommandError({ code: 'ENOENT' }))
    )

    await expect(adapter.inspect()).resolves.toEqual({
      installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      reason: 'not_found',
      status: 'missing',
      version: null
    })
  })

  it.each([
    [{ killed: true, signal: 'SIGTERM' }, 'timed_out'],
    [{ code: 'EACCES' }, 'permission_denied'],
    [{ code: 1 }, 'command_failed']
  ])('keeps command failure %j distinct from a missing CLI', async (error, reason) => {
    const adapter = new NodeCodexCliAdapter(async () => Promise.reject(createCommandError(error)))

    await expect(adapter.inspect()).resolves.toEqual({
      reason,
      status: 'temporarily_unavailable',
      version: null
    })
  })

  it('treats empty version output as temporarily unavailable', async () => {
    const adapter = new NodeCodexCliAdapter(createCommandRunner('  \n'))

    await expect(adapter.inspect()).resolves.toEqual({
      reason: 'invalid_output',
      status: 'temporarily_unavailable',
      version: null
    })
  })
})

function createCommandRunner(stdout: string): CodexCliCommandRunner {
  return async () => ({ stdout })
}

function createCommandError(properties: Record<string, unknown>): Error {
  return Object.assign(new Error('Codex CLI inspection failed.'), properties)
}
