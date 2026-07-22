import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { AgentProviderContribution } from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { OpenCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/opencode/OpenCodeAgentProviderContribution'

const openCodeSessionId = 'ses_0123456789abCDEFGHIJKLMNOP'

describe('OpenCode Agent Provider contribution', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('merges launch-scoped MCP, instructions, plugin, and resume configuration', async () => {
    vi.stubEnv(
      'OPENCODE_CONFIG_CONTENT',
      JSON.stringify({
        instructions: ['existing-instructions.md'],
        mcp: {
          inherited: {
            command: ['inherited-mcp'],
            enabled: true,
            type: 'local'
          }
        },
        model: 'inherited/provider-model',
        plugin: ['inherited-plugin@1.0.0']
      })
    )
    const contribution = createContribution()
    const artifacts = new AgentLaunchArtifactScope()
    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      cleancodeMcp: {
        bearerToken: 'launch-secret',
        serverUrl: 'http://127.0.0.1:43121/mcp'
      },
      onProviderSessionIdentified: vi.fn(),
      providerSessionRef: {
        formatVersion: 1,
        kind: 'opencode-session',
        value: openCodeSessionId
      },
      workspaceDirectory: process.cwd()
    })
    artifacts.seal()

    try {
      expect(contribution.descriptor.capabilities).toEqual({
        activityTracking: true,
        cleancodeMcp: 'best_effort',
        launchInstructions: true,
        resume: true,
        sessionIdentityCapture: true,
        sessionRefCodec: true
      })
      expect(contribution).toMatchObject({
        cleancodeCapability: expect.any(Object),
        resume: expect.any(Object),
        sessionRefCodec: expect.any(Object),
        telemetry: expect.any(Object)
      })
      expect(plan.args).toEqual(['--session', openCodeSessionId, process.cwd()])
      expect(plan.args).not.toContain('--config')
      expect(plan.env.CLEANCODE_OPENCODE_MCP_TOKEN).toBe('launch-secret')
      expect(plan.env.NO_PROXY?.split(',')).toEqual(
        expect.arrayContaining(['127.0.0.1', 'localhost', '::1'])
      )
      expect(plan.env.no_proxy).toBe(plan.env.NO_PROXY)

      const config = readInlineConfig(plan.env)
      expect(config).toMatchObject({
        instructions: ['existing-instructions.md', expect.any(String)],
        mcp: {
          cleancode: {
            enabled: true,
            headers: {
              Authorization: 'Bearer {env:CLEANCODE_OPENCODE_MCP_TOKEN}'
            },
            oauth: false,
            type: 'remote',
            url: 'http://127.0.0.1:43121/mcp'
          },
          inherited: {
            command: ['inherited-mcp'],
            enabled: true,
            type: 'local'
          }
        },
        model: 'inherited/provider-model',
        plugin: ['inherited-plugin@1.0.0', expect.stringMatching(/^file:\/\//)]
      })
      expect(plan.env.OPENCODE_CONFIG_CONTENT).not.toContain('launch-secret')

      const instructionPath = config.instructions.at(-1)!
      const pluginPath = fileURLToPath(config.plugin.at(-1)!)
      await expect(readFile(instructionPath, 'utf8')).resolves.toContain('CleanCode')
      await expect(readFile(pluginPath, 'utf8')).resolves.toContain('session.created')

      await artifacts.dispose()
      await expect(readFile(instructionPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(pluginPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await artifacts.dispose()
    }
  })

  it('reports only top-level launch-workspace session identity and activity', async () => {
    const onActivityChanged = vi.fn()
    const onProviderSessionIdentified = vi.fn()
    const contribution = createContribution()
    const artifacts = new AgentLaunchArtifactScope()
    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      onActivityChanged,
      onProviderSessionIdentified,
      workspaceDirectory: process.cwd()
    })
    artifacts.seal()

    try {
      const config = readInlineConfig(plan.env)
      const pluginUrl = config.plugin.find((entry) => entry.startsWith('file://'))
      expect(pluginUrl).toBeDefined()
      vi.stubEnv('CLEANCODE_OPENCODE_REPORTER_URL', plan.env.CLEANCODE_OPENCODE_REPORTER_URL)
      vi.stubEnv('CLEANCODE_OPENCODE_REPORTER_TOKEN', plan.env.CLEANCODE_OPENCODE_REPORTER_TOKEN)
      const pluginSource = await readFile(fileURLToPath(pluginUrl!), 'utf8')
      const pluginDataUrl = `data:text/javascript;base64,${Buffer.from(pluginSource).toString('base64')}`
      const pluginModule = (await import(/* @vite-ignore */ pluginDataUrl)) as Record<
        string,
        unknown
      >
      const plugin = Object.values(pluginModule).find(
        (entry): entry is (input: { directory: string }) => Promise<OpenCodePluginHooks> =>
          typeof entry === 'function'
      )
      expect(plugin).toBeDefined()
      const hooks = await plugin!({ directory: process.cwd() })

      await hooks.event({
        event: {
          id: 'event-child-created',
          properties: {
            info: {
              directory: process.cwd(),
              id: 'ses_0123456789abABCDEFGHIJKLMN',
              parentID: openCodeSessionId
            }
          },
          type: 'session.created'
        }
      })
      await hooks.event({
        event: {
          id: 'event-root-created',
          properties: {
            info: {
              directory: process.cwd(),
              id: openCodeSessionId
            }
          },
          type: 'session.created'
        }
      })
      await hooks.event({
        event: {
          id: 'event-permission-asked',
          properties: {
            id: 'permission-1',
            sessionID: openCodeSessionId
          },
          type: 'permission.asked'
        }
      })
      await hooks.event({
        event: {
          id: 'event-permission-replied',
          properties: {
            permissionID: 'permission-1',
            response: 'once',
            sessionID: openCodeSessionId
          },
          type: 'permission.replied'
        }
      })
      await hooks.event({
        event: {
          id: 'event-legacy-permission-updated',
          properties: {
            id: 'permission-legacy',
            sessionID: openCodeSessionId
          },
          type: 'permission.updated'
        }
      })
      await hooks.event({
        event: {
          id: 'event-question-asked',
          properties: {
            id: 'question-1',
            sessionID: openCodeSessionId
          },
          type: 'question.asked'
        }
      })
      await hooks.event({
        event: {
          id: 'event-question-replied',
          properties: {
            id: 'question-1',
            sessionID: openCodeSessionId
          },
          type: 'question.replied'
        }
      })
      await hooks.event({
        event: {
          id: 'event-busy',
          properties: {
            sessionID: openCodeSessionId,
            status: { type: 'busy' }
          },
          type: 'session.status'
        }
      })
      await hooks.event({
        event: {
          id: 'event-idle',
          properties: { sessionID: openCodeSessionId },
          type: 'session.idle'
        }
      })

      await vi.waitFor(() =>
        expect(onProviderSessionIdentified).toHaveBeenCalledWith({
          formatVersion: 1,
          kind: 'opencode-session',
          metadata: { confirmedBy: 'session-created-event' },
          value: openCodeSessionId
        })
      )
      expect(onProviderSessionIdentified).toHaveBeenCalledTimes(1)
      expect(onActivityChanged).toHaveBeenCalledWith('waiting_approval')
      expect(
        onActivityChanged.mock.calls.filter(([status]) => status === 'waiting_approval')
      ).toHaveLength(2)
      expect(onActivityChanged).toHaveBeenCalledWith('waiting_input')
      expect(onActivityChanged).toHaveBeenCalledWith('working')
      expect(onActivityChanged).toHaveBeenCalledWith('idle')

      const unauthorized = await fetch(plan.env.CLEANCODE_OPENCODE_REPORTER_URL!, {
        body: '{}',
        method: 'POST'
      })
      expect(unauthorized.status).toBe(401)
    } finally {
      await artifacts.dispose()
    }
  })

  it('accepts only canonical OpenCode session IDs', () => {
    const contribution: AgentProviderContribution = createContribution()
    expect(contribution.sessionRefCodec).toBeDefined()
    expect(
      contribution.sessionRefCodec!.parse({
        formatVersion: 1,
        kind: 'opencode-session',
        value: ` ${openCodeSessionId} `
      })
    ).toEqual({
      formatVersion: 1,
      kind: 'opencode-session',
      value: openCodeSessionId
    })
    for (const invalid of [
      '550e8400-e29b-41d4-a716-446655440000',
      'ses_0123456789abABCDEFGHIJKLM',
      'ses_0123456789agABCDEFGHIJKLMN'
    ]) {
      expect(() =>
        contribution.sessionRefCodec!.parse({
          formatVersion: 1,
          kind: 'opencode-session',
          value: invalid
        })
      ).toThrowError(expect.objectContaining({ code: 'AGENT_SESSION_INVALID' }))
    }
  })
})

interface OpenCodePluginHooks {
  event(input: {
    readonly event: {
      readonly id: string
      readonly properties: Readonly<Record<string, unknown>>
      readonly type: string
    }
  }): Promise<void>
}

interface OpenCodeInlineConfig {
  readonly instructions: readonly string[]
  readonly mcp: Readonly<Record<string, unknown>>
  readonly model?: string
  readonly plugin: readonly string[]
}

function createContribution(): OpenCodeAgentProviderContribution {
  return new OpenCodeAgentProviderContribution({
    detector: {
      inspect: async () => ({
        providerId: 'opencode',
        status: 'installed',
        version: 'test'
      })
    }
  })
}

function readInlineConfig(env: Readonly<Record<string, string>>): OpenCodeInlineConfig {
  expect(env.OPENCODE_CONFIG_CONTENT).toBeDefined()
  return JSON.parse(env.OPENCODE_CONFIG_CONTENT!) as OpenCodeInlineConfig
}
