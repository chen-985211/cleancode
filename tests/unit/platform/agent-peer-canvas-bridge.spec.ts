import { AgentPeerCanvasBridge } from '../../../src/platform/electron-main/AgentPeerCanvasBridge'

describe('Agent peer canvas bridge', () => {
  it('only accepts a response from the originating canvas and cleans up timed-out requests', async () => {
    vi.useFakeTimers()
    const bridge = new AgentPeerCanvasBridge()
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const scope = { projectId: 'p', workspaceId: 'w', agentId: 'new-agent', providerId: 'codex' }
    try {
      const pending = bridge.create(sender, scope)
      const requestId = sender.send.mock.calls[0]?.[1].requestId
      expect(bridge.complete({ ...sender }, { requestId, created: true })).toBe(false)
      expect(bridge.complete(sender, { requestId, created: true })).toBe(true)
      await pending
      const expired = bridge.create(sender, scope)
      const failure = expect(expired).rejects.toMatchObject({ code: 'AGENT_TOOL_UNAVAILABLE' })
      await vi.advanceTimersByTimeAsync(30_000)
      await failure
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      bridge.dispose()
      vi.useRealTimers()
    }
  })
})
