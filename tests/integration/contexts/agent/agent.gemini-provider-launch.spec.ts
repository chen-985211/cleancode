import { readFile } from 'node:fs/promises'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { createBuiltinAgentProviderContributions } from '../../../../src/contexts/agent/infrastructure/providers/catalog/BuiltinAgentProviderCatalog'

describe('Gemini Agent Provider launch integration', () => {
  it('creates an isolated MCP settings file and removes it with the launch scope', async () => {
    const contribution = createBuiltinAgentProviderContributions().find(
      ({ descriptor }) => descriptor.id === 'gemini'
    )
    if (!contribution) throw new Error('Gemini Provider contribution was not registered.')

    const artifacts = new AgentLaunchArtifactScope()
    let settingsPath: string | undefined

    try {
      const plan = await contribution.launcher.createLaunchPlan({
        artifacts,
        cleancodeMcp: {
          bearerToken: 'integration-secret',
          serverUrl: 'http://127.0.0.1:49123/mcp/gemini-integration'
        },
        onProviderSessionIdentified: vi.fn(),
        workspaceDirectory: process.cwd()
      })
      settingsPath = plan.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH
      expect(settingsPath).toBeDefined()

      const contents = await readFile(settingsPath!, 'utf8')
      expect(JSON.parse(contents)).toMatchObject({
        hooks: {
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
            httpUrl: 'http://127.0.0.1:49123/mcp/gemini-integration',
            trust: true
          }
        }
      })
      expect(contents).not.toContain('integration-secret')
    } finally {
      await artifacts.dispose()
    }

    await expect(readFile(settingsPath!, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

it('preserves system policy and hooks while bootstrapping an interactive collaboration task', async () => {
  const { GeminiAgentProviderContribution } =
    await import('../../../../src/contexts/agent/infrastructure/providers/gemini/GeminiAgentProviderContribution')
  const { createTemporaryProviderConfig } =
    await import('../../../../src/contexts/agent/infrastructure/providers/shared/TemporaryProviderConfig')
  const original = await createTemporaryProviderConfig(
    'gemini-user-settings-',
    'settings.json',
    JSON.stringify({
      security: { disableYoloMode: true },
      mcpServers: { user: { command: 'user-mcp' } },
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'user-hook' }] }] }
    })
  )
  const artifacts = new AgentLaunchArtifactScope()
  try {
    const plan = await new GeminiAgentProviderContribution().launcher.createLaunchPlan({
      artifacts,
      workspaceDirectory: process.cwd(),
      initialPrompt: 'Read the collaboration inbox.',
      cleancodeMcp: { bearerToken: 'secret', serverUrl: 'http://127.0.0.1:4321/mcp' },
      onProviderSessionIdentified: () => undefined,
      launchProfile: {
        executable: 'gemini',
        arguments: [],
        environment: { GEMINI_CLI_SYSTEM_SETTINGS_PATH: original.path }
      }
    })
    const settings = JSON.parse(await readFile(plan.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH!, 'utf8'))
    expect(settings.security).toEqual({ disableYoloMode: true })
    expect(settings.mcpServers.user).toEqual({ command: 'user-mcp' })
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('user-hook')
    expect(plan.args).toContain('--prompt-interactive')
    expect(plan.args.at(-1)).toBe('Read the collaboration inbox.')
  } finally {
    await artifacts.dispose()
    await original.dispose()
  }
})
