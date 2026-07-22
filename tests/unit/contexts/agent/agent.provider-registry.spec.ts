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
              capabilities: { ...contribution.descriptor.capabilities, resume: true }
            }
          }
        ])
    ).toThrowError(expect.objectContaining({ code: 'AGENT_PROVIDER_INVALID' }))
  })
})

function createContribution(id: string, displayName = id): AgentProviderContribution {
  return {
    descriptor: {
      capabilities: {
        cleancodeMcp: false,
        resume: false,
        structuredLifecycle: false,
        systemInstructions: false
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
        executable: id,
        temporaryArtifacts: []
      })
    }
  }
}
