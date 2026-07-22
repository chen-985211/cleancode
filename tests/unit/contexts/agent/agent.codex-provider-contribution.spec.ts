import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'

describe('Codex Agent Provider contribution', () => {
  it('builds the existing resume, MCP, instruction, no-alt-screen and notify launch contract', async () => {
    const contribution = new CodexAgentProviderContribution({
      detector: {
        inspect: async () => ({ status: 'installed', version: 'codex-cli 1.0.0' })
      },
      telemetryFactory: async () => ({
        dispose: async () => undefined,
        env: { CLEANCODE_CODEX_NOTIFY_TOKEN: 'notify-token' },
        notifyCommand: ['/usr/bin/node', '-e', 'reporter']
      })
    })

    const plan = await contribution.launcher.createLaunchPlan({
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

    expect(contribution.descriptor).toMatchObject({
      capabilities: {
        cleancodeMcp: true,
        resume: true,
        structuredLifecycle: true,
        systemInstructions: true
      },
      id: 'codex'
    })
    expect(plan.executable).toBe('codex')
    expect(plan.args).toContain('--no-alt-screen')
    expect(plan.args).toEqual(
      expect.arrayContaining(['resume', '0190d8a1-8b7d-7d75-9f62-7a663ef87e33', '-C', '/repo/app'])
    )
    expect(plan.args.join('\n')).toContain('mcp_servers.cleancode=')
    expect(plan.args.join('\n')).toContain('required=true')
    expect(plan.args.join('\n')).toContain('developer_instructions=')
    expect(plan.args.join('\n')).toContain('notify=')
    expect(plan.env).toMatchObject({
      CLEANCODE_CODEX_NOTIFY_TOKEN: 'notify-token',
      CLEANCODE_MCP_TOKEN: 'mcp-token'
    })
    expect(plan.temporaryArtifacts).toHaveLength(1)
  })
})
