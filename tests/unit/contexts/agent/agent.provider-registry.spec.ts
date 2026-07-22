import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
import type {
  AgentProviderContribution,
  AgentProviderAvailability
} from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'

describe('Agent Provider registry', () => {
  it('lists descriptors and resolves a contribution without Provider branches', async () => {
    const codex = createContribution('codex', 'Codex')
    const claude = createContribution('claude-code', 'Claude Code')
    const registry = new AgentProviderRegistry([codex, claude])

    expect(registry.listDescriptors()).toEqual([codex.descriptor, claude.descriptor])
    expect(registry.require('claude-code')).toBe(claude)
    await expect(registry.inspect('codex')).resolves.toMatchObject({
      providerId: 'codex',
      status: 'installed'
    })
  })

  it('parses a session reference through the owning Provider codec', () => {
    const codec = {
      parse: vi.fn((sessionRef) => ({ ...sessionRef, value: sessionRef.value.trim() }))
    }
    const contribution = createContribution('codex')
    const registry = new AgentProviderRegistry([
      {
        ...contribution,
        descriptor: {
          ...contribution.descriptor,
          capabilities: {
            ...contribution.descriptor.capabilities,
            resume: true,
            sessionRefCodec: true
          }
        },
        resume: { createResumeArgs: () => [] },
        sessionRefCodec: codec
      }
    ])
    const sessionRef = registry.parseSessionRef('codex', {
      formatVersion: 1,
      kind: 'codex-thread',
      value: ' 0190d8a1-8b7d-7d75-9f62-7a663ef87e33 '
    })

    expect(codec.parse).toHaveBeenCalledOnce()
    expect(sessionRef.providerId).toBe('codex')
    expect(sessionRef.toSnapshot()).toEqual({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
  })

  it('rejects duplicate and unknown Provider ids', () => {
    expect(
      () => new AgentProviderRegistry([createContribution('codex'), createContribution('codex')])
    ).toThrowError(expect.objectContaining({ code: 'AGENT_PROVIDER_DUPLICATE' }))

    const registry = new AgentProviderRegistry([createContribution('codex')])
    expect(() => registry.require('claude-code')).toThrowError(
      expect.objectContaining({ code: 'AGENT_PROVIDER_NOT_FOUND' })
    )
  })

  it('rejects a descriptor that advertises an unimplemented optional capability', () => {
    const contribution = createContribution('codex')

    expect(
      () =>
        new AgentProviderRegistry([
          {
            ...contribution,
            descriptor: {
              ...contribution.descriptor,
              capabilities: {
                ...contribution.descriptor.capabilities,
                resume: true,
                sessionRefCodec: true
              }
            }
          }
        ])
    ).toThrowError(expect.objectContaining({ code: 'AGENT_PROVIDER_INVALID' }))
  })

  it('rejects a resumable Provider contribution without a session-reference codec', () => {
    const contribution = createContribution('codex')

    expect(
      () =>
        new AgentProviderRegistry([
          {
            ...contribution,
            descriptor: {
              ...contribution.descriptor,
              capabilities: {
                ...contribution.descriptor.capabilities,
                resume: true,
                sessionRefCodec: true
              }
            },
            resume: { createResumeArgs: () => [] }
          }
        ])
    ).toThrowError(expect.objectContaining({ code: 'AGENT_PROVIDER_INVALID' }))
  })

  it.each([
    {
      actual: { activity: false, sessionIdentity: false },
      advertised: { activity: true, sessionIdentity: false },
      mismatch: 'advertised activity'
    },
    {
      actual: { activity: true, sessionIdentity: false },
      advertised: { activity: false, sessionIdentity: false },
      mismatch: 'unadvertised activity'
    },
    {
      actual: { activity: false, sessionIdentity: false },
      advertised: { activity: false, sessionIdentity: true },
      mismatch: 'advertised session identity'
    },
    {
      actual: { activity: false, sessionIdentity: true },
      advertised: { activity: false, sessionIdentity: false },
      mismatch: 'unadvertised session identity'
    }
  ])('rejects telemetry with $mismatch signal', ({ actual, advertised }) => {
    expect(
      () => new AgentProviderRegistry([createTelemetryContribution(advertised, actual)])
    ).toThrowError(expect.objectContaining({ code: 'AGENT_PROVIDER_INVALID' }))
  })

  it('accepts independently matching telemetry signals', () => {
    const contribution = createTelemetryContribution(
      { activity: false, sessionIdentity: true },
      { activity: false, sessionIdentity: true }
    )

    expect(new AgentProviderRegistry([contribution]).require('codex')).toBe(contribution)
  })
})

function createTelemetryContribution(
  advertised: { readonly activity: boolean; readonly sessionIdentity: boolean },
  actual: { readonly activity: boolean; readonly sessionIdentity: boolean }
): AgentProviderContribution {
  const contribution = createContribution('codex')
  return {
    ...contribution,
    descriptor: {
      ...contribution.descriptor,
      capabilities: {
        ...contribution.descriptor.capabilities,
        activityTracking: advertised.activity,
        sessionIdentityCapture: advertised.sessionIdentity,
        sessionRefCodec: advertised.sessionIdentity
      }
    },
    sessionRefCodec: advertised.sessionIdentity ? { parse: (sessionRef) => sessionRef } : undefined,
    telemetry: {
      prepare: async () => ({ args: [], env: {} }),
      signals: actual
    }
  }
}

function createContribution(id: string, displayName = id): AgentProviderContribution {
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
      displayName,
      id
    },
    detector: {
      inspect: async (): Promise<AgentProviderAvailability> => ({
        providerId: id,
        status: 'installed',
        version: '1.0.0'
      })
    },
    launcher: {
      createLaunchPlan: async () => ({
        args: [],
        env: {},
        executable: id
      })
    }
  }
}
