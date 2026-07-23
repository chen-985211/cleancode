import type {
  AgentProviderAvailability,
  AgentProviderContribution
} from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import type { AgentProviderDetectionEnvironmentPort } from '../../../../src/contexts/agent/application/ports/AgentProviderDetectionEnvironmentPort'
import { AgentProviderAvailabilityService } from '../../../../src/contexts/agent/application/services/AgentProviderAvailabilityService'
import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'

describe('Agent Provider availability service', () => {
  it('inspects registered Providers in parallel and keeps registry order for creatable results', async () => {
    const codexInspection = createDeferred<AgentProviderAvailability>()
    const claudeInspection = createDeferred<AgentProviderAvailability>()
    const openCodeInspection = createDeferred<AgentProviderAvailability>()
    const codex = createContribution('codex', () => codexInspection.promise)
    const claude = createContribution('claude-code', () => claudeInspection.promise)
    const openCode = createContribution('opencode', () => openCodeInspection.promise)
    const environment = createEnvironment()
    const service = new AgentProviderAvailabilityService(
      new AgentProviderRegistry([codex, claude, openCode]),
      environment
    )

    const discovery = service.discoverCreatableProviders()
    await flushPromises()

    expect(environment.prepare).toHaveBeenCalledOnce()
    expect(codex.detector.inspect).toHaveBeenCalledOnce()
    expect(claude.detector.inspect).toHaveBeenCalledOnce()
    expect(openCode.detector.inspect).toHaveBeenCalledOnce()

    openCodeInspection.resolve(installed('opencode', '3.0.0'))
    codexInspection.resolve(installed('codex', '1.0.0'))
    claudeInspection.resolve({
      installCommand: 'install claude',
      providerId: 'claude-code',
      reason: 'not_found',
      status: 'missing',
      version: null
    })

    await expect(discovery).resolves.toEqual([
      {
        availability: installed('codex', '1.0.0'),
        descriptor: codex.descriptor
      },
      {
        availability: installed('opencode', '3.0.0'),
        descriptor: openCode.descriptor
      }
    ])
  })

  it('shares pending and settled snapshots until one refresh starts a new generation', async () => {
    const firstInspection = createDeferred<AgentProviderAvailability>()
    const secondInspection = createDeferred<AgentProviderAvailability>()
    const contribution = createContribution(
      'codex',
      vi
        .fn()
        .mockImplementationOnce(() => firstInspection.promise)
        .mockImplementationOnce(() => secondInspection.promise)
    )
    const environment = createEnvironment()
    const service = new AgentProviderAvailabilityService(
      new AgentProviderRegistry([contribution]),
      environment
    )

    const first = service.inspect('codex')
    const sharedPending = service.inspect('codex')
    await flushPromises()
    expect(contribution.detector.inspect).toHaveBeenCalledOnce()

    firstInspection.resolve(installed('codex', '1.0.0'))
    await expect(Promise.all([first, sharedPending])).resolves.toEqual([
      installed('codex', '1.0.0'),
      installed('codex', '1.0.0')
    ])
    await expect(service.inspect('codex')).resolves.toEqual(installed('codex', '1.0.0'))
    expect(contribution.detector.inspect).toHaveBeenCalledOnce()

    const refreshed = service.inspect('codex', { refresh: true })
    const sharedRefresh = service.inspect('codex', { refresh: true })
    await flushPromises()
    expect(contribution.detector.inspect).toHaveBeenCalledTimes(2)

    secondInspection.resolve(installed('codex', '2.0.0'))
    await expect(Promise.all([refreshed, sharedRefresh])).resolves.toEqual([
      installed('codex', '2.0.0'),
      installed('codex', '2.0.0')
    ])
    expect(environment.prepare).toHaveBeenCalledTimes(2)
    expect(environment.prepare).toHaveBeenLastCalledWith({ refresh: true })
  })

  it('isolates thrown and mismatched inspections without hiding healthy Providers', async () => {
    const thrown = createContribution('broken', async () => {
      throw new Error('probe failed')
    })
    const mismatched = createContribution('mismatched', async () =>
      installed('somebody-else', '1.0.0')
    )
    const healthy = createContribution('healthy', async () => installed('healthy', '4.0.0'))
    const service = new AgentProviderAvailabilityService(
      new AgentProviderRegistry([thrown, mismatched, healthy]),
      createEnvironment()
    )

    await expect(service.discoverCreatableProviders()).resolves.toEqual([
      {
        availability: installed('healthy', '4.0.0'),
        descriptor: healthy.descriptor
      }
    ])
    await expect(service.inspect('broken')).resolves.toEqual({
      providerId: 'broken',
      reason: 'command_failed',
      status: 'temporarily_unavailable',
      version: null
    })
    await expect(service.inspect('mismatched')).resolves.toEqual({
      providerId: 'mismatched',
      reason: 'invalid_output',
      status: 'temporarily_unavailable',
      version: null
    })
  })
})

function createContribution(
  id: string,
  inspect: () => Promise<AgentProviderAvailability>
): AgentProviderContribution & {
  readonly detector: { readonly inspect: ReturnType<typeof vi.fn> }
} {
  return {
    descriptor: {
      capabilities: {
        activityTracking: false,
        cleancodeMcp: 'unsupported',
        launchInstructions: false,
        resume: false,
        sessionIdentityCapture: false,
        sessionRefCodec: false
      },
      displayName: id,
      icon: {
        paths: [{ d: 'M2 2h20v20H2z' }],
        viewBox: '0 0 24 24'
      },
      id
    },
    detector: { inspect: vi.fn(inspect) },
    launcher: {
      createLaunchPlan: async () => ({
        args: [],
        env: {},
        executable: id
      })
    }
  }
}

function createEnvironment(): AgentProviderDetectionEnvironmentPort & {
  readonly prepare: ReturnType<typeof vi.fn>
} {
  return {
    prepare: vi.fn(async () => undefined)
  }
}

function installed(providerId: string, version: string): AgentProviderAvailability {
  return { providerId, status: 'installed', version }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolvePromise: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
