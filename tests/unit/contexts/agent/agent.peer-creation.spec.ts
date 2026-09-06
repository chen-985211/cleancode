import { AgentPeerCreationRegistry } from '../../../../src/contexts/agent/application/services/AgentPeerCreationRegistry'

const caller = { agentId: 'author', projectId: 'p', workspaceId: 'w' }
const input = { agentId: 'reviewer', providerId: 'codex', initialTask: 'Review commit abc' }

describe('Agent peer creation', () => {
  it('shares concurrent retries, rejects changed intent, and tracks startup separately from task delivery', async () => {
    const findAgent = vi.fn().mockResolvedValue(null)
    const registry = new AgentPeerCreationRegistry({ findAgent })
    const create = vi.fn(async () => {
      findAgent.mockResolvedValue({ id: input.agentId, providerId: input.providerId })
    })
    await Promise.all([
      registry.create(caller, input, create),
      registry.create(caller, input, create)
    ])
    expect(create).toHaveBeenCalledTimes(1)
    const target = { ...caller, agentId: input.agentId }
    await expect(
      registry.create(caller, { ...input, initialTask: 'Different' }, create)
    ).rejects.toThrow()
    registry.markStarted(target)
    expect(await registry.create(caller, input, create)).toMatchObject({
      agentId: 'reviewer',
      launchStatus: 'running'
    })
    expect(create).toHaveBeenCalledTimes(1)
    registry.markStopped(target, 'failed')
    expect(await registry.create(caller, input, create)).toMatchObject({ launchStatus: 'failed' })
    findAgent.mockResolvedValue(null)
    await expect(registry.create(caller, input, create)).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('retains the same creation intent after a canvas failure without commandeering existing agents', async () => {
    const findAgent = vi.fn().mockResolvedValue(null)
    const registry = new AgentPeerCreationRegistry({ findAgent })
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('canvas unavailable'))
      .mockImplementationOnce(async () => {
        findAgent.mockResolvedValue({ id: input.agentId, providerId: input.providerId })
      })
    await expect(registry.create(caller, input, create)).rejects.toThrow('canvas unavailable')
    expect(await registry.create(caller, input, create)).toMatchObject({
      agentId: 'reviewer',
      launchStatus: 'pending'
    })
    expect(create).toHaveBeenCalledTimes(2)
    findAgent.mockResolvedValue({ id: 'existing' })
    await expect(
      registry.create(caller, { ...input, agentId: 'existing' }, create)
    ).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(2)
  })
})
