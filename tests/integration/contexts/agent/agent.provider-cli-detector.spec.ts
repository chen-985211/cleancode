import {
  NodeAgentProviderCliDetector,
  type AgentProviderCliCommandRunner
} from '../../../../src/contexts/agent/infrastructure/providers/shared/NodeAgentProviderCliDetector'

describe('Agent Provider CLI detector', () => {
  it('detects an installed Provider CLI version from command output', async () => {
    const detector = createCodexDetector(createCommandRunner('codex-cli 0.143.0\n'))

    await expect(detector.inspect()).resolves.toEqual({
      providerId: 'codex',
      status: 'installed',
      version: 'codex-cli 0.143.0'
    })
  })

  it('returns the Provider install command only when the executable is not found', async () => {
    const detector = createCodexDetector(async () =>
      Promise.reject(createCommandError({ code: 'ENOENT' }))
    )

    await expect(detector.inspect()).resolves.toEqual({
      installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      providerId: 'codex',
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
    const detector = createCodexDetector(async () => Promise.reject(createCommandError(error)))

    await expect(detector.inspect()).resolves.toEqual({
      providerId: 'codex',
      reason,
      status: 'temporarily_unavailable',
      version: null
    })
  })

  it('treats empty version output as temporarily unavailable', async () => {
    const detector = createCodexDetector(createCommandRunner('  \n'))

    await expect(detector.inspect()).resolves.toEqual({
      providerId: 'codex',
      reason: 'invalid_output',
      status: 'temporarily_unavailable',
      version: null
    })
  })

  it('distinguishes an installed but incompatible Provider version', async () => {
    const detector = createCodexDetector(createCommandRunner('codex-cli 0.142.9\n'), '0.143.0')

    await expect(detector.inspect()).resolves.toEqual({
      installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      minimumVersion: '0.143.0',
      providerId: 'codex',
      status: 'upgrade_required',
      version: 'codex-cli 0.142.9'
    })
  })

  it('requires parseable semantic output when a minimum version is declared', async () => {
    const detector = createCodexDetector(createCommandRunner('development build\n'), '0.143.0')

    await expect(detector.inspect()).resolves.toEqual({
      providerId: 'codex',
      reason: 'invalid_output',
      status: 'temporarily_unavailable',
      version: null
    })
  })
})

function createCodexDetector(
  runCommand: AgentProviderCliCommandRunner,
  minimumVersion?: string
): NodeAgentProviderCliDetector {
  return new NodeAgentProviderCliDetector({
    executable: 'codex',
    installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
    ...(minimumVersion ? { minimumVersion } : {}),
    providerId: 'codex',
    runCommand
  })
}

function createCommandRunner(stdout: string): AgentProviderCliCommandRunner {
  return async () => ({ stderr: '', stdout })
}

function createCommandError(properties: Record<string, unknown>): Error {
  return Object.assign(new Error('Provider CLI inspection failed.'), properties)
}
