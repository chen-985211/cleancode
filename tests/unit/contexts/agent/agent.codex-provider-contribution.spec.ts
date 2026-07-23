import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'
import { NodeAgentProviderCliDetector } from '../../../../src/contexts/agent/infrastructure/providers/shared/NodeAgentProviderCliDetector'

describe('Codex Agent Provider contribution', () => {
  it('uses the shared cross-platform CLI detector by default', () => {
    const contribution = new CodexAgentProviderContribution()

    expect(contribution.detector).toBeInstanceOf(NodeAgentProviderCliDetector)
  })

  it('builds the existing resume, MCP, instruction, no-alt-screen and notify launch contract', async () => {
    const disposeTelemetry = vi.fn(async () => undefined)
    const contribution = new CodexAgentProviderContribution({
      detector: {
        inspect: async () => ({
          providerId: 'codex',
          status: 'installed',
          version: 'codex-cli 1.0.0'
        })
      },
      telemetryFactory: async () => ({
        dispose: disposeTelemetry,
        env: { CLEANCODE_CODEX_NOTIFY_TOKEN: 'notify-token' },
        notifyCommand: ['/usr/bin/node', '-e', 'reporter']
      })
    })

    const artifacts = new AgentLaunchArtifactScope()
    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      cleancodeMcp: {
        bearerToken: 'mcp-token',
        serverUrl: 'http://127.0.0.1:43123/mcp'
      },
      onProviderSessionIdentified: () => undefined,
      providerSessionRef: {
        formatVersion: 1,
        kind: 'codex-thread',
        value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
      },
      workspaceDirectory: '/repo/app'
    })
    artifacts.seal()

    try {
      expect(contribution.descriptor).toMatchObject({
        capabilities: {
          activityTracking: false,
          cleancodeMcp: 'required',
          launchInstructions: true,
          resume: true,
          sessionIdentityCapture: true,
          sessionRefCodec: true
        },
        icon: {
          paths: expect.arrayContaining([expect.objectContaining({ d: expect.any(String) })]),
          viewBox: '0 0 24 24'
        },
        id: 'codex'
      })
      expect(contribution).toHaveProperty('sessionRefCodec')
      expect(
        contribution.sessionRefCodec.parse({
          formatVersion: 1,
          kind: 'codex-thread',
          value: ' 0190d8a1-8b7d-7d75-9f62-7a663ef87e33 '
        })
      ).toEqual({
        formatVersion: 1,
        kind: 'codex-thread',
        value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
      })
      expect(() =>
        contribution.sessionRefCodec.parse({
          formatVersion: 1,
          kind: 'claude-session',
          value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
        })
      ).toThrowError(expect.objectContaining({ code: 'AGENT_SESSION_INVALID' }))
      expect(() =>
        contribution.sessionRefCodec.parse({
          formatVersion: 1,
          kind: 'codex-thread',
          value: 'not-a-uuid'
        })
      ).toThrowError(expect.objectContaining({ code: 'AGENT_SESSION_INVALID' }))
      expect(plan.executable).toBe('codex')
      expect(plan.args).toContain('--no-alt-screen')
      expect(plan.args).toEqual(
        expect.arrayContaining([
          'resume',
          '0190d8a1-8b7d-7d75-9f62-7a663ef87e33',
          '-C',
          '/repo/app'
        ])
      )
      expect(plan.args.join('\n')).toContain('mcp_servers.cleancode=')
      expect(plan.args.join('\n')).toContain('required=true')
      expect(plan.args.join('\n')).toContain('developer_instructions=')
      expect(plan.args.join('\n')).toContain('notify=')
      expect(plan.env).toMatchObject({
        CLEANCODE_CODEX_NOTIFY_TOKEN: 'notify-token',
        CLEANCODE_MCP_TOKEN: 'mcp-token'
      })
      expect(plan.env.NO_PROXY?.split(',')).toEqual(
        expect.arrayContaining(['127.0.0.1', 'localhost', '::1'])
      )
      expect(plan.env.no_proxy).toBe(plan.env.NO_PROXY)
      expect(disposeTelemetry).not.toHaveBeenCalled()
    } finally {
      await artifacts.dispose()
    }
    expect(disposeTelemetry).toHaveBeenCalledOnce()
  })
})
