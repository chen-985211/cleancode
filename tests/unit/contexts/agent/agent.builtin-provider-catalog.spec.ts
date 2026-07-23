import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import {
  builtinAgentProviderIds,
  createBuiltinAgentProviderContributions
} from '../../../../src/contexts/agent/infrastructure/providers/catalog/BuiltinAgentProviderCatalog'

describe('built-in Agent Provider catalog', () => {
  it('contains the complete supported 33-Agent catalog in stable order', () => {
    expect(builtinAgentProviderIds).toEqual([
      'claude-code',
      'openclaude',
      'codex',
      'grok',
      'copilot',
      'opencode',
      'mimo-code',
      'ante',
      'pi',
      'omp',
      'gemini',
      'antigravity',
      'aider',
      'goose',
      'amp',
      'kilo',
      'kiro',
      'crush',
      'aug',
      'autohand',
      'cline',
      'codebuff',
      'command-code',
      'continue',
      'cursor',
      'droid',
      'kimi',
      'mistral-vibe',
      'qwen-code',
      'rovo',
      'hermes',
      'devin',
      'openclaw'
    ])
    expect(new Set(builtinAgentProviderIds)).toHaveProperty('size', 33)
  })

  it('contributes launch metadata, official documentation, and serializable icons', () => {
    const contributions = createBuiltinAgentProviderContributions()

    expect(contributions.map(({ descriptor }) => descriptor.id)).toEqual(builtinAgentProviderIds)
    for (const contribution of contributions) {
      expect(contribution.descriptor.documentationUrl).toMatch(/^https:\/\//)
      expect(contribution.descriptor.launch?.executable).not.toBe('')
      expect(() => structuredClone(contribution.descriptor)).not.toThrow()
    }
  })

  it.each([
    ['kiro', 'kiro-cli', ['chat']],
    ['command-code', 'cmd', ['--trust']],
    ['hermes', 'hermes', ['--tui']],
    ['openclaw', 'openclaw', ['tui']],
    ['rovo', 'acli', ['rovodev', 'run']]
  ] as const)('uses the adapted interactive launch for %s', async (id, executable, args) => {
    const contribution = createBuiltinAgentProviderContributions().find(
      (candidate) => candidate.descriptor.id === id
    )!
    const artifacts = new AgentLaunchArtifactScope()
    const launch = contribution.descriptor.launch!
    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      launchProfile: {
        arguments: launch.defaultArguments,
        environment: launch.defaultEnvironment,
        executable: launch.executable
      },
      onProviderSessionIdentified: vi.fn(),
      workspaceDirectory: '/repo'
    })

    expect(plan).toMatchObject({ args, executable })
    await artifacts.dispose()
  })

  it('uses the audited executable, base arguments, and Yolo configuration', () => {
    const contributions = createBuiltinAgentProviderContributions()
    const executableById: Record<(typeof builtinAgentProviderIds)[number], string> = {
      aider: 'aider',
      amp: 'amp',
      ante: 'ante',
      antigravity: 'agy',
      aug: 'auggie',
      autohand: 'autohand',
      'claude-code': 'claude',
      cline: 'cline',
      codebuff: 'codebuff',
      codex: 'codex',
      'command-code': 'cmd',
      continue: 'cn',
      copilot: 'copilot',
      crush: 'crush',
      cursor: 'cursor-agent',
      devin: 'devin',
      droid: 'droid',
      gemini: 'gemini',
      goose: 'goose',
      grok: 'grok',
      hermes: 'hermes',
      kilo: 'kilo',
      kimi: 'kimi',
      kiro: 'kiro-cli',
      'mimo-code': 'mimo',
      'mistral-vibe': 'vibe',
      omp: 'omp',
      openclaw: 'openclaw',
      openclaude: 'openclaude',
      opencode: 'opencode',
      pi: 'pi',
      'qwen-code': 'qwen',
      rovo: 'acli'
    }
    const baseArgumentsById: Partial<
      Record<(typeof builtinAgentProviderIds)[number], readonly string[]>
    > = {
      'command-code': ['--trust'],
      hermes: ['--tui'],
      kiro: ['chat'],
      openclaw: ['tui'],
      rovo: ['rovodev', 'run']
    }
    const baseEnvironmentById: Partial<
      Record<(typeof builtinAgentProviderIds)[number], Readonly<Record<string, string>>>
    > = {}
    const yoloArgumentsById: Partial<
      Record<(typeof builtinAgentProviderIds)[number], readonly string[]>
    > = {
      aider: ['--yes-always'],
      ante: ['--yolo'],
      antigravity: ['--dangerously-skip-permissions'],
      autohand: ['--unrestricted'],
      'claude-code': ['--dangerously-skip-permissions'],
      cline: ['--auto-approve', 'true'],
      codex: ['--dangerously-bypass-approvals-and-sandbox'],
      'command-code': ['--yolo'],
      continue: ['--auto'],
      copilot: ['--yolo'],
      crush: ['--yolo'],
      cursor: ['--yolo'],
      devin: ['--permission-mode', 'bypass'],
      droid: ['--skip-permissions-unsafe'],
      gemini: ['--approval-mode=yolo'],
      grok: ['--permission-mode', 'bypassPermissions'],
      hermes: ['--yolo'],
      kimi: ['--yolo'],
      kiro: ['--trust-all-tools'],
      'mistral-vibe': ['--agent', 'auto-approve'],
      openclaude: ['--dangerously-skip-permissions'],
      'qwen-code': ['--approval-mode', 'yolo'],
      rovo: ['--yolo']
    }

    for (const contribution of contributions) {
      const { id, launch } = contribution.descriptor
      const providerId = id as (typeof builtinAgentProviderIds)[number]
      expect(launch).toEqual({
        defaultArguments: baseArgumentsById[providerId] ?? [],
        defaultEnvironment: baseEnvironmentById[providerId] ?? {},
        executable: executableById[providerId],
        ...(providerId === 'goose'
          ? { permission: { environment: { GOOSE_MODE: 'auto' } } }
          : yoloArgumentsById[providerId]
            ? { permission: { arguments: yoloArgumentsById[providerId] } }
            : {})
      })
    }
  })

  it('uses the audited vector marks for providers with dedicated glyphs', () => {
    const descriptors = new Map(
      createBuiltinAgentProviderContributions().map(({ descriptor }) => [descriptor.id, descriptor])
    )

    expect(descriptors.get('omp')?.icon).toMatchObject({
      linearGradients: [{ id: 'brand' }],
      viewBox: '0 0 64 64'
    })
    expect(descriptors.get('aider')?.icon).toMatchObject({ viewBox: '0 0 436 436' })
    expect(descriptors.get('copilot')?.icon).toMatchObject({ viewBox: '0 0 16 16' })
    expect(descriptors.get('kilo')?.icon).toMatchObject({ viewBox: '0 0 512 512' })
    expect(descriptors.get('droid')?.icon).toMatchObject({ viewBox: '0 0 20 20' })
  })
})
