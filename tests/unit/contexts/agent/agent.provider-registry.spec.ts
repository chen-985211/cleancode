import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
import type {
  AgentProviderContribution,
  AgentProviderAvailability
} from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'
import { HermesAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/hermes/HermesAgentProviderContribution'
import { OpenClawAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/openclaw/OpenClawAgentProviderContribution'
import { OpenCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/opencode/OpenCodeAgentProviderContribution'
import { PiAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/pi/PiAgentProviderContribution'

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

  it('accepts a future Provider through the provider-neutral registry contract', async () => {
    const fixture = createContribution('fixture-provider', 'Fixture Provider')
    const registry = new AgentProviderRegistry([fixture])

    expect(registry.listDescriptors()).toEqual([fixture.descriptor])
    expect(registry.require('fixture-provider')).toBe(fixture)
    await expect(registry.inspect('fixture-provider')).resolves.toMatchObject({
      providerId: 'fixture-provider',
      status: 'installed'
    })
  })

  it('accepts safe gradients and transforms in a vector Provider icon', () => {
    const contribution = createContribution('fixture-provider')
    const icon = {
      linearGradients: [
        {
          id: 'brand',
          stops: [
            { offset: '0', stopColor: 'oklch(0.7 0.24 340)' },
            { offset: '100%', stopColor: '#FFFFFF' }
          ],
          x1: '0',
          x2: '1',
          y1: '0',
          y2: '1'
        }
      ],
      paths: [
        {
          d: 'M2 2h20v20H2z',
          fill: 'url(#brand)',
          transform: 'translate(0 24) scale(.1 -.1)'
        }
      ],
      viewBox: '0 0 24 24'
    } as const

    expect(
      () =>
        new AgentProviderRegistry([
          {
            ...contribution,
            descriptor: { ...contribution.descriptor, icon }
          }
        ])
    ).not.toThrow()
  })

  it('accepts the safe serializable icons contributed by every built-in Provider', () => {
    const registry = new AgentProviderRegistry([
      new CodexAgentProviderContribution(),
      new ClaudeCodeAgentProviderContribution(),
      new PiAgentProviderContribution(),
      new HermesAgentProviderContribution(),
      new OpenClawAgentProviderContribution(),
      new OpenCodeAgentProviderContribution()
    ])

    expect(registry.listDescriptors().map(({ icon, id }) => ({ icon, id }))).toEqual([
      expect.objectContaining({ icon: expect.objectContaining({ viewBox: '0 0 24 24' }) }),
      expect.objectContaining({ icon: expect.objectContaining({ viewBox: '0 0 24 24' }) }),
      expect.objectContaining({ icon: expect.objectContaining({ viewBox: '0 0 800 800' }) }),
      expect.objectContaining({
        icon: expect.objectContaining({ imageDataUrl: expect.stringMatching(/^data:image\/png/) })
      }),
      expect.objectContaining({
        icon: expect.objectContaining({ imageDataUrl: expect.stringMatching(/^data:image\/png/) })
      }),
      expect.objectContaining({ icon: expect.objectContaining({ viewBox: '0 0 512 512' }) })
    ])
    expect(() => structuredClone(registry.listDescriptors())).not.toThrow()
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
    ['missing icon', undefined],
    ['empty path list', { paths: [], viewBox: '0 0 24 24' }],
    ['invalid view box', { paths: [{ d: 'M2 2h20v20H2z' }], viewBox: '0 0 -24 24' }],
    ['raw SVG markup', { paths: [{ d: '<svg onload=alert(1) />' }], viewBox: '0 0 24 24' }],
    ['malformed path entry', { paths: [null], viewBox: '0 0 24 24' }],
    ['remote raster URL', { imageDataUrl: 'https://example.com/icon.png', imageType: 'png' }],
    ['malformed PNG data', { imageDataUrl: 'data:image/png;base64,not-a-png', imageType: 'png' }],
    [
      'unsafe path fill',
      {
        paths: [{ d: 'M2 2h20v20H2z', fill: 'url(https://example.com/mark.svg)' }],
        viewBox: '0 0 24 24'
      }
    ],
    [
      'missing gradient reference',
      {
        paths: [{ d: 'M2 2h20v20H2z', fill: 'url(#missing)' }],
        viewBox: '0 0 24 24'
      }
    ],
    [
      'unsafe path transform',
      {
        paths: [{ d: 'M2 2h20v20H2z', transform: 'translate(0) url(example)' }],
        viewBox: '0 0 24 24'
      }
    ],
    [
      'unsafe gradient color',
      {
        linearGradients: [
          {
            id: 'brand',
            stops: [
              { offset: '0', stopColor: '#000000' },
              { offset: '1', stopColor: 'url(https://example.com/mark.svg)' }
            ],
            x1: '0',
            x2: '1',
            y1: '0',
            y2: '1'
          }
        ],
        paths: [{ d: 'M2 2h20v20H2z', fill: 'url(#brand)' }],
        viewBox: '0 0 24 24'
      }
    ]
  ])('rejects a Provider descriptor with invalid icon: %s', (_case, icon) => {
    const contribution = createContribution('fixture-provider')

    expect(
      () =>
        new AgentProviderRegistry([
          {
            ...contribution,
            descriptor: {
              ...contribution.descriptor,
              icon
            } as AgentProviderContribution['descriptor']
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
        cleancodeMcp: false,
        launchInstructions: false,
        resume: false,
        sessionIdentityCapture: false,
        sessionRefCodec: false
      },
      displayName,
      icon: {
        paths: [{ d: 'M2 2h20v20H2z' }],
        viewBox: '0 0 24 24'
      },
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
