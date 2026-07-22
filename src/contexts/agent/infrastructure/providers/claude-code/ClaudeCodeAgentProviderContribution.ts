import { randomUUID } from 'node:crypto'

import { cleancodeMcpDeveloperInstructions } from '../../../application/dto/AgentToolProtocol'
import type {
  AgentCapabilityInjector,
  AgentLaunchPlanner,
  AgentProviderContribution,
  AgentProviderDetector,
  AgentResumeStrategy,
  AgentRuntimeArtifact,
  AgentTelemetryContribution,
  CreateAgentLaunchPlanCommand
} from '../../../application/ports/AgentProviderContribution'
import type { ProviderSessionRefSnapshot } from '../../../domain/value-objects/ProviderSessionRef'
import { NodeAgentProviderCliDetector } from '../shared/NodeAgentProviderCliDetector'
import { createTemporaryProviderConfig } from '../shared/TemporaryProviderConfig'
import { ClaudeCodeHookReporter } from './ClaudeCodeHookReporter'

const claudeCodeInstallCommand = 'curl -fsSL https://claude.ai/install.sh | bash'

export interface ClaudeCodeAgentProviderContributionOptions {
  readonly baseArgs?: readonly string[]
  readonly command?: string
  readonly createSessionId?: () => string
  readonly detector?: AgentProviderDetector
}

export class ClaudeCodeAgentProviderContribution implements AgentProviderContribution {
  readonly descriptor = {
    capabilities: {
      cleancodeMcp: true,
      resume: true,
      structuredLifecycle: true,
      systemInstructions: true
    },
    displayName: 'Claude Code',
    id: 'claude-code'
  } as const
  readonly detector: AgentProviderDetector
  readonly resume: AgentResumeStrategy = new ClaudeCodeResumeStrategy()
  readonly telemetry: AgentTelemetryContribution = new ClaudeCodeTelemetryContribution()
  readonly cleancodeCapability: AgentCapabilityInjector = new ClaudeCodeCapabilityInjector()
  readonly launcher: AgentLaunchPlanner

  constructor(options: ClaudeCodeAgentProviderContributionOptions = {}) {
    this.detector =
      options.detector ??
      new NodeAgentProviderCliDetector({
        executable: options.command ?? 'claude',
        installCommand: claudeCodeInstallCommand,
        providerId: this.descriptor.id
      })
    this.launcher = new ClaudeCodeLaunchPlanner({
      baseArgs: options.baseArgs ?? [],
      capability: this.cleancodeCapability,
      command: options.command ?? 'claude',
      createSessionId: options.createSessionId ?? randomUUID,
      resume: this.resume,
      telemetry: this.telemetry
    })
  }
}

class ClaudeCodeResumeStrategy implements AgentResumeStrategy {
  createResumeArgs(sessionRef: ProviderSessionRefSnapshot): readonly string[] {
    assertClaudeCodeSessionRef(sessionRef)
    return ['--resume', sessionRef.value]
  }
}

class ClaudeCodeCapabilityInjector implements AgentCapabilityInjector {
  async inject(command: { readonly bearerToken: string; readonly serverUrl: string }) {
    const config = await createTemporaryProviderConfig(
      'cleancode-claude-mcp-',
      'mcp.json',
      JSON.stringify({
        mcpServers: {
          cleancode: {
            headers: { Authorization: `Bearer ${command.bearerToken}` },
            type: 'http',
            url: command.serverUrl
          }
        }
      })
    )
    return {
      args: [
        '--mcp-config',
        config.path,
        '--allowedTools',
        'mcp__cleancode__*',
        '--append-system-prompt',
        cleancodeMcpDeveloperInstructions
      ],
      env: {},
      temporaryArtifacts: [config]
    }
  }
}

class ClaudeCodeTelemetryContribution implements AgentTelemetryContribution {
  async prepare(command: Parameters<AgentTelemetryContribution['prepare']>[0]) {
    const reporter = await ClaudeCodeHookReporter.start({
      onActivityChanged: command.onActivityChanged ?? (() => undefined),
      onSessionIdentified: (sessionId) =>
        command.onProviderSessionIdentified({
          formatVersion: 1,
          kind: 'claude-session',
          value: sessionId
        }),
      workspaceDirectory: command.workspaceDirectory
    })
    const relay = await createTemporaryProviderConfig(
      'cleancode-claude-hook-',
      'relay.mjs',
      claudeHookRelayScript
    )
    const hookCommand = `${quoteShellArg(process.execPath)} ${quoteShellArg(relay.path)}`
    const settings = await createTemporaryProviderConfig(
      'cleancode-claude-settings-',
      'settings.json',
      JSON.stringify({ hooks: createClaudeHooks(hookCommand) })
    )
    return {
      args: ['--settings', settings.path],
      env: {
        CLEANCODE_CLAUDE_HOOK_TOKEN: reporter.token,
        CLEANCODE_CLAUDE_HOOK_URL: reporter.url
      },
      temporaryArtifacts: [reporter, relay, settings]
    }
  }
}

class ClaudeCodeLaunchPlanner implements AgentLaunchPlanner {
  constructor(
    private readonly options: {
      readonly capability: AgentCapabilityInjector
      readonly baseArgs: readonly string[]
      readonly command: string
      readonly createSessionId: () => string
      readonly resume: AgentResumeStrategy
      readonly telemetry: AgentTelemetryContribution
    }
  ) {}

  async createLaunchPlan(command: CreateAgentLaunchPlanCommand) {
    const telemetry = await this.options.telemetry.prepare(command)
    try {
      const sessionArgs = command.providerSessionRef
        ? this.options.resume.createResumeArgs(command.providerSessionRef)
        : this.createSessionArgs(command.onProviderSessionIdentified)
      const capability = command.cleancodeMcp
        ? await this.options.capability.inject(command.cleancodeMcp)
        : { args: [], env: {}, temporaryArtifacts: [] as readonly AgentRuntimeArtifact[] }
      return {
        args: [...this.options.baseArgs, ...sessionArgs, ...capability.args, ...telemetry.args],
        env: { ...capability.env, ...telemetry.env },
        executable: this.options.command,
        temporaryArtifacts: [
          ...(capability.temporaryArtifacts ?? []),
          ...telemetry.temporaryArtifacts
        ]
      }
    } catch (error) {
      await Promise.allSettled(telemetry.temporaryArtifacts.map((artifact) => artifact.dispose()))
      throw error
    }
  }

  private createSessionArgs(
    onProviderSessionIdentified: (sessionRef: ProviderSessionRefSnapshot) => void
  ): readonly string[] {
    const sessionId = this.options.createSessionId()
    const sessionRef = { formatVersion: 1, kind: 'claude-session', value: sessionId } as const
    assertClaudeCodeSessionRef(sessionRef)
    onProviderSessionIdentified(sessionRef)
    return ['--session-id', sessionId]
  }
}

function createClaudeHooks(command: string) {
  const handler = { hooks: [{ command, type: 'command' }] }
  return {
    Notification: [handler],
    PermissionRequest: [handler],
    SessionEnd: [handler],
    SessionStart: [{ matcher: 'startup|resume|clear|compact', ...handler }],
    Stop: [handler],
    UserPromptSubmit: [handler]
  }
}

function quoteShellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

const claudeHookRelayScript = [
  "let body='';",
  'for await (const chunk of process.stdin) body+=chunk;',
  'await fetch(process.env.CLEANCODE_CLAUDE_HOOK_URL,{',
  'method:"POST",',
  'headers:{authorization:`Bearer ${process.env.CLEANCODE_CLAUDE_HOOK_TOKEN}`},',
  'body',
  '}).catch(()=>{});'
].join('')

function assertClaudeCodeSessionRef(sessionRef: ProviderSessionRefSnapshot): void {
  if (
    sessionRef.formatVersion !== 1 ||
    sessionRef.kind !== 'claude-session' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sessionRef.value
    )
  ) {
    throw new Error('Unsupported Claude Code Provider session reference.')
  }
}
