import { readFile } from 'node:fs/promises'

import type { AgentLaunchPlan } from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
import { createBuiltinAgentProviderContributions } from '../../../../src/contexts/agent/infrastructure/providers/catalog/BuiltinAgentProviderCatalog'

describe('Gemini Agent Provider contribution', () => {
  it('creates a client-assigned session and injects launch-scoped CleanCode MCP settings', async () => {
    const contribution = requireGeminiContribution()
    const artifacts = new AgentLaunchArtifactScope()
    const onActivityChanged = vi.fn()
    const onProviderSessionIdentified = vi.fn()
    const plan = (await contribution.launcher.createLaunchPlan({
      artifacts,
      cleancodeMcp: {
        bearerToken: 'gemini-secret',
        serverUrl: 'http://127.0.0.1:43121/mcp/gemini'
      },
      onActivityChanged,
      onProviderSessionIdentified,
      workspaceDirectory: '/repo/worktree'
    })) as AgentLaunchPlan & {
      readonly providerSessionRefOnStarted?: {
        readonly formatVersion: number
        readonly kind: string
        readonly value: string
      }
    }
    artifacts.seal()

    expect(contribution.descriptor.capabilities).toEqual({
      activityTracking: true,
      cleancodeMcp: true,
      launchInstructions: false,
      resume: true,
      sessionIdentityCapture: true,
      sessionRefCodec: true
    })
    expect(() => new AgentProviderRegistry([contribution])).not.toThrow()
    const sessionIdIndex = plan.args.indexOf('--session-id')
    expect(sessionIdIndex).toBeGreaterThanOrEqual(0)
    const sessionId = plan.args[sessionIdIndex + 1]
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(plan.providerSessionRefOnStarted).toEqual({
      formatVersion: 1,
      kind: 'gemini-session',
      value: sessionId
    })
    expect(plan.env.CLEANCODE_MCP_TOKEN).toBe('gemini-secret')
    expect(plan.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH).toMatch(/settings\.json$/)

    const settingsPath = plan.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH!
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    expect(settings).toMatchObject({
      hooks: {
        AfterAgent: expect.any(Array),
        BeforeAgent: expect.any(Array),
        SessionStart: [
          {
            hooks: [
              {
                command: expect.stringContaining('relay.mjs'),
                type: 'command'
              }
            ]
          }
        ]
      },
      mcpServers: {
        cleancode: {
          headers: { Authorization: 'Bearer ${CLEANCODE_MCP_TOKEN}' },
          httpUrl: 'http://127.0.0.1:43121/mcp/gemini',
          trust: true
        }
      }
    })
    expect(await readFile(settingsPath, 'utf8')).not.toContain('gemini-secret')

    for (const sessionId of [
      '550e8400-e29b-41d4-a716-446655440000',
      '660e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440000',
      '660e8400-e29b-41d4-a716-446655440001',
      '660e8400-e29b-41d4-a716-446655440001'
    ]) {
      await fetch(plan.env.CLEANCODE_GEMINI_HOOK_URL!, {
        body: JSON.stringify({
          cwd: '/repo/worktree',
          hook_event_name: 'SessionStart',
          session_id: sessionId,
          source: sessionId.startsWith('66') ? 'resume' : 'startup'
        }),
        headers: { Authorization: `Bearer ${plan.env.CLEANCODE_GEMINI_HOOK_TOKEN}` },
        method: 'POST'
      })
    }
    await vi.waitFor(() =>
      expect(onProviderSessionIdentified).toHaveBeenLastCalledWith({
        formatVersion: 1,
        kind: 'gemini-session',
        metadata: { confirmedBy: 'session-start-hook' },
        value: '660e8400-e29b-41d4-a716-446655440001'
      })
    )
    expect(onProviderSessionIdentified).toHaveBeenCalledTimes(4)

    for (const hookEventName of ['BeforeAgent', 'AfterAgent']) {
      await fetch(plan.env.CLEANCODE_GEMINI_HOOK_URL!, {
        body: JSON.stringify({
          cwd: '/repo/worktree',
          hook_event_name: hookEventName,
          session_id: '660e8400-e29b-41d4-a716-446655440001'
        }),
        headers: { Authorization: `Bearer ${plan.env.CLEANCODE_GEMINI_HOOK_TOKEN}` },
        method: 'POST'
      })
    }
    await vi.waitFor(() => expect(onActivityChanged).toHaveBeenLastCalledWith('idle'))
    expect(onActivityChanged).toHaveBeenCalledWith('working')

    await artifacts.dispose()
    await expect(readFile(settingsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('resumes only a validated Gemini session without assigning a replacement identity', async () => {
    const contribution = requireGeminiContribution()
    const artifacts = new AgentLaunchArtifactScope()
    const plan = (await contribution.launcher.createLaunchPlan({
      artifacts,
      onProviderSessionIdentified: vi.fn(),
      providerSessionRef: {
        formatVersion: 1,
        kind: 'gemini-session',
        value: '550e8400-e29b-41d4-a716-446655440000'
      },
      workspaceDirectory: '/repo/worktree'
    })) as AgentLaunchPlan & {
      readonly providerSessionRefOnStarted?: unknown
    }
    artifacts.seal()

    expect(plan.args).toEqual(['--resume', '550e8400-e29b-41d4-a716-446655440000'])
    expect(plan.args).not.toContain('--session-id')
    expect(plan.providerSessionRefOnStarted).toBeUndefined()
    expect(plan.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH).toMatch(/settings\.json$/)
    expect(plan.env.CLEANCODE_MCP_TOKEN).toBeUndefined()

    expect(() =>
      contribution.sessionRefCodec?.parse({
        formatVersion: 1,
        kind: 'codex-thread',
        value: '550e8400-e29b-41d4-a716-446655440000'
      })
    ).toThrowError(expect.objectContaining({ code: 'AGENT_SESSION_INVALID' }))

    await artifacts.dispose()
  })
})

function requireGeminiContribution() {
  const contribution = createBuiltinAgentProviderContributions().find(
    ({ descriptor }) => descriptor.id === 'gemini'
  )
  if (!contribution) throw new Error('Gemini Provider contribution was not registered.')
  return contribution
}
