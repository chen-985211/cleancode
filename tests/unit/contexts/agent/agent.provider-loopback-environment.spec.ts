import { createAgentProviderLoopbackEnvironment } from '../../../../src/contexts/agent/infrastructure/providers/shared/AgentProviderLoopbackEnvironment'

describe('Agent Provider loopback environment', () => {
  it('preserves, merges, and deduplicates both inherited no-proxy spellings', () => {
    expect(
      createAgentProviderLoopbackEnvironment({
        NO_PROXY: 'internal.example, LOCALHOST',
        no_proxy: 'other.example,internal.example'
      })
    ).toEqual({
      NO_PROXY: 'internal.example,LOCALHOST,other.example,127.0.0.1,::1',
      no_proxy: 'internal.example,LOCALHOST,other.example,127.0.0.1,::1'
    })
  })
})
