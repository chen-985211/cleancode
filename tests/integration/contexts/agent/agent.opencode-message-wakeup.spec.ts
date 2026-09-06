import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import {
  agentInboxWakeupPrompt,
  type AgentMessageWakeupPort
} from '../../../../src/contexts/agent/application/ports/AgentMessageDeliveryPort'
import { OpenCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/opencode/OpenCodeAgentProviderContribution'

// Real plugin module and loopback transport; the native OpenCode SDK is simulated.
describe('OpenCode native message transport', () => {
  it('binds the resumed session, preserves routing, rejects busy delivery and closes its listener', async () => {
    const artifacts = new AgentLaunchArtifactScope()
    const sessionID = 'ses_123456789abcabcdefghijklmn'
    let wakeup: AgentMessageWakeupPort | null | undefined
    const plan = await new OpenCodeAgentProviderContribution().launcher.createLaunchPlan({
      artifacts,
      workspaceDirectory: process.cwd(),
      providerSessionRef: { formatVersion: 1, kind: 'opencode-session', value: sessionID },
      onProviderSessionIdentified: () => undefined,
      messageDelivery: (value) => {
        wakeup = value
      }
    })
    artifacts.seal()
    const original = { ...process.env }
    Object.assign(process.env, plan.env)
    process.env.CLEANCODE_OPENCODE_MCP_TOKEN = 'launch-mcp-credential'
    const promptAsync = vi.fn(async () => ({ data: undefined, response: { ok: true } }))
    const status = vi.fn(async () => ({ data: {} }))
    try {
      const config = JSON.parse(plan.env.OPENCODE_CONFIG_CONTENT!)
      const url = config.plugin.at(-1)
      const module = await import(/* @vite-ignore */ url)
      const hooks = await module.CleanCodeOpenCodeReporterPlugin({
        directory: process.cwd(),
        client: {
          session: {
            get: async () => ({ data: { id: sessionID, directory: process.cwd() } }),
            messages: async () => ({
              data: [
                {
                  info: {
                    role: 'user',
                    agent: 'plan',
                    model: { providerID: 'test', modelID: 'chosen' },
                    variant: 'high'
                  }
                }
              ]
            }),
            promptAsync,
            status
          }
        }
      })
      const nativeConfig = {
        mcp: {
          cleancode: { headers: { Authorization: 'Bearer {env:CLEANCODE_OPENCODE_MCP_TOKEN}' } },
          userServer: { headers: { Authorization: 'Bearer user-owned' } }
        }
      }
      process.env.CLEANCODE_OPENCODE_MCP_TOKEN = 'replacement-launch'
      await hooks.config(nativeConfig)
      expect(nativeConfig.mcp.cleancode.headers.Authorization).toBe('Bearer launch-mcp-credential')
      expect(nativeConfig.mcp.userServer.headers.Authorization).toBe('Bearer user-owned')
      await vi.waitFor(() => expect(wakeup).toBeTruthy())
      await Promise.all(
        [1, 2].map(() =>
          wakeup!.notify({ notificationId: 'first', signal: new AbortController().signal })
        )
      )
      expect(promptAsync).toHaveBeenCalledOnce()
      expect(promptAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: sessionID },
          body: expect.objectContaining({
            agent: 'plan',
            model: { providerID: 'test', modelID: 'chosen' },
            variant: 'high',
            parts: [{ type: 'text', text: agentInboxWakeupPrompt }]
          })
        })
      )
      status.mockResolvedValueOnce({ data: { [sessionID]: { type: 'busy' } } })
      await expect(
        wakeup!.notify({ notificationId: 'second', signal: new AbortController().signal })
      ).rejects.toThrow()
      expect(promptAsync).toHaveBeenCalledOnce()
      await hooks.event({
        event: { type: 'session.deleted', properties: { info: { id: sessionID } } }
      })
      await expect(
        wakeup!.notify({ notificationId: 'third', signal: new AbortController().signal })
      ).rejects.toThrow()
      await hooks.event({ event: { type: 'server.instance.disposed' } })
      // Even a previously accepted ID cannot reach an obsolete native listener.
      await expect(
        wakeup!.notify({ notificationId: 'first', signal: new AbortController().signal })
      ).rejects.toThrow()
      expect(promptAsync).toHaveBeenCalledOnce()
    } finally {
      await artifacts.dispose()
      for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]
      Object.assign(process.env, original)
    }
  })
  it('keeps telemetry usable when the native SDK cannot submit messages', async () => {
    const artifacts = new AgentLaunchArtifactScope()
    const identified = vi.fn()
    const delivery = vi.fn()
    const plan = await new OpenCodeAgentProviderContribution().launcher.createLaunchPlan({
      artifacts,
      workspaceDirectory: process.cwd(),
      onProviderSessionIdentified: identified,
      messageDelivery: delivery
    })
    artifacts.seal()
    const original = { ...process.env }
    Object.assign(process.env, plan.env)
    try {
      const module = await import(
        /* @vite-ignore */ JSON.parse(plan.env.OPENCODE_CONFIG_CONTENT!).plugin.at(-1)
      )
      const hooks = await module.CleanCodeOpenCodeReporterPlugin({
        directory: process.cwd(),
        client: { session: {} }
      })
      expect(delivery).toHaveBeenCalledWith(null)
      const sessionID = 'ses_123456789abcabcdefghijklmn'
      await hooks['chat.message']({ sessionID })
      await hooks.event({
        event: {
          type: 'session.created',
          properties: { info: { id: sessionID, directory: process.cwd() } }
        }
      })
      expect(identified).toHaveBeenCalledWith(expect.objectContaining({ value: sessionID }))
    } finally {
      await artifacts.dispose()
      for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]
      Object.assign(process.env, original)
    }
  })
})
