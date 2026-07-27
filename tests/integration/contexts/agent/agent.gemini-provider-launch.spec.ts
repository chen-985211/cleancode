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
