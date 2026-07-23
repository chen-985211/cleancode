import { delimiter } from 'node:path'

import {
  NodeAgentProviderShellPathHydrator,
  type AgentProviderShellPathProbe
} from '../../../../src/contexts/agent/infrastructure/providers/shared/NodeAgentProviderShellPathHydrator'

describe('Agent Provider shell PATH hydrator', () => {
  it('reads a banner-safe POSIX login-shell PATH and merges it ahead of inherited entries', async () => {
    const probe = createProbe()
    const environment = {
      PATH: ['/usr/bin', '/shared/bin'].join(delimiter),
      SHELL: '/bin/zsh'
    }
    const hydrator = new NodeAgentProviderShellPathHydrator({
      environment,
      platform: 'darwin',
      probe: probe.start
    })

    const hydration = hydrator.prepare()
    expect(probe.start).toHaveBeenCalledWith(
      '/bin/zsh',
      expect.objectContaining({
        args: ['-ilc', expect.stringContaining('__CLEANCODE_AGENT_SHELL_PATH__')],
        environment
      })
    )

    probe.resolve(
      `startup banner\n\u001b[31m__CLEANCODE_AGENT_SHELL_PATH__${['/agent/bin', '/shared/bin'].join(
        delimiter
      )}__CLEANCODE_AGENT_SHELL_PATH__\u001b[0m\n`
    )
    await hydration

    expect(environment.PATH).toBe(['/agent/bin', '/shared/bin', '/usr/bin'].join(delimiter))
  })

  it('caches a completed probe and shares one in-flight forced refresh', async () => {
    const firstProbe = createProbe()
    const secondProbe = createProbe()
    const start = vi
      .fn<AgentProviderShellPathProbe>()
      .mockImplementationOnce(firstProbe.start)
      .mockImplementationOnce(secondProbe.start)
    const environment = { PATH: '/usr/bin', SHELL: '/bin/bash' }
    const hydrator = new NodeAgentProviderShellPathHydrator({
      environment,
      platform: 'linux',
      probe: start
    })

    const first = hydrator.prepare()
    firstProbe.resolve('__CLEANCODE_AGENT_SHELL_PATH__/first/bin__CLEANCODE_AGENT_SHELL_PATH__')
    await first
    await hydrator.prepare()
    expect(start).toHaveBeenCalledOnce()

    const refreshed = hydrator.prepare({ refresh: true })
    const sharedRefresh = hydrator.prepare({ refresh: true })
    expect(start).toHaveBeenCalledTimes(2)
    secondProbe.resolve('__CLEANCODE_AGENT_SHELL_PATH__/second/bin__CLEANCODE_AGENT_SHELL_PATH__')
    await Promise.all([refreshed, sharedRefresh])

    expect(environment.PATH).toBe(['/second/bin', '/first/bin', '/usr/bin'].join(delimiter))
  })

  it('cancels a timed-out shell probe and preserves the inherited PATH', async () => {
    vi.useFakeTimers()
    try {
      const probe = createProbe()
      const environment = { PATH: '/usr/bin', SHELL: '/bin/zsh' }
      const hydrator = new NodeAgentProviderShellPathHydrator({
        environment,
        platform: 'darwin',
        probe: probe.start,
        timeoutMs: 50
      })

      const hydration = hydrator.prepare()
      await vi.advanceTimersByTimeAsync(50)
      await hydration

      expect(probe.cancel).toHaveBeenCalledOnce()
      expect(environment.PATH).toBe('/usr/bin')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not start a login shell on Windows', async () => {
    const probe = createProbe()
    const environment = { PATH: 'C:\\Windows\\System32', SHELL: 'C:\\bad-shell.exe' }
    const hydrator = new NodeAgentProviderShellPathHydrator({
      environment,
      platform: 'win32',
      probe: probe.start
    })

    await hydrator.prepare()

    expect(probe.start).not.toHaveBeenCalled()
    expect(environment.PATH).toBe('C:\\Windows\\System32')
  })
})

function createProbe(): {
  readonly cancel: ReturnType<typeof vi.fn>
  readonly resolve: (output: string) => void
  readonly start: ReturnType<typeof vi.fn<AgentProviderShellPathProbe>>
} {
  let resolveOutput: (output: string) => void = () => undefined
  const output = new Promise<string>((resolve) => {
    resolveOutput = resolve
  })
  const cancel = vi.fn()
  return {
    cancel,
    resolve: resolveOutput,
    start: vi.fn(() => ({ cancel, output }))
  }
}
