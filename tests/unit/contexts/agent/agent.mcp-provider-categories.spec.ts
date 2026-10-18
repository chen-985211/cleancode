import { readFile } from 'node:fs/promises'
import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { createAgentMcpConfiguration } from '../../../../src/contexts/agent/application/dto/AgentMcpConfiguration'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'
import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'
import { OpenCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/opencode/OpenCodeAgentProviderContribution'

describe.each(['darwin', 'linux', 'win32'] as const)(
  'category-scoped Provider instructions on %s',
  (runtimePlatform) => {
    it.each([
      { canvas: false, collaboration: true },
      { canvas: true, collaboration: false },
      { canvas: true, collaboration: true }
    ])('uses the same launch instructions for supported Providers: %j', async (toolCategories) => {
      const expected = createAgentMcpConfiguration(toolCategories).developerInstructions
      const artifacts = new AgentLaunchArtifactScope()
      const command = {
        artifacts,
        bearerToken: 'token',
        serverUrl: 'http://127.0.0.1:43123/mcp',
        toolCategories
      }
      try {
        const codex = await new CodexAgentProviderContribution({
          runtimePlatform
        }).cleancodeCapability.inject(command)
        const encoded = codex.args
          .find((argument) => argument.startsWith('developer_instructions='))!
          .slice('developer_instructions='.length)
        const decoded =
          runtimePlatform === 'win32'
            ? encoded.startsWith("'''")
              ? encoded.slice(3, -3)
              : encoded.slice(1, -1)
            : JSON.parse(encoded)
        expect(decoded).toBe(expected)
        const claude = await new ClaudeCodeAgentProviderContribution().cleancodeCapability.inject(
          command
        )
        const instructionPath = claude.args[claude.args.indexOf('--append-system-prompt-file') + 1]!
        expect(await readFile(instructionPath, 'utf8')).toBe(expected)
        const openCode = await new OpenCodeAgentProviderContribution().launcher.createLaunchPlan({
          artifacts,
          cleancodeMcp: command,
          onProviderSessionIdentified: vi.fn(),
          workspaceDirectory: process.cwd()
        })
        const config = JSON.parse(openCode.env.OPENCODE_CONFIG_CONTENT!) as {
          instructions: string[]
        }
        expect(await readFile(config.instructions.at(-1)!, 'utf8')).toBe(expected)
      } finally {
        artifacts.seal()
        await artifacts.dispose()
      }
    })
  }
)
