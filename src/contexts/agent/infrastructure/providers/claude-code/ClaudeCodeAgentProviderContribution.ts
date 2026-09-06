import { randomUUID } from 'node:crypto'

import { createExpectedAppError } from '../../../../../shared-kernel/application/errors/AppError'
import { cleancodeMcpDeveloperInstructions } from '../../../application/dto/AgentToolProtocol'
import type {
  AgentCapabilityInjector,
  AgentLaunchPlanner,
  AgentProviderContribution,
  AgentProviderDetector,
  AgentProviderSessionRefCodec,
  AgentResumeStrategy,
  AgentTelemetryContribution,
  CreateAgentLaunchPlanCommand
} from '../../../application/ports/AgentProviderContribution'
import {
  ProviderSessionRef,
  type ProviderSessionRefSnapshot
} from '../../../domain/value-objects/ProviderSessionRef'
import { resolveAgentProviderInstallCommand } from '../shared/AgentProviderInstallation'
import { claudeCodeProviderIcon } from '../shared/AgentProviderBrandIcons'
import { createAgentProviderLoopbackEnvironment } from '../shared/AgentProviderLoopbackEnvironment'
import {
  NodeAgentProviderCliDetector,
  supportsAgentProviderVersion
} from '../shared/NodeAgentProviderCliDetector'
import { createTemporaryProviderConfig } from '../shared/TemporaryProviderConfig'
import { ClaudeCodeHookReporter } from './ClaudeCodeHookReporter'
import { ClaudeCodeInboxSignal } from './ClaudeCodeInboxSignal'
import { mergeClaudeCodeLaunchInstructions } from './ClaudeCodeLaunchInstructions'
import { mergeClaudeCodeLaunchSettings } from './ClaudeCodeLaunchSettings'

export const claudeCodeInstallCommands = {
  linux: 'curl -fsSL https://claude.ai/install.sh | bash',
  macos: 'curl -fsSL https://claude.ai/install.sh | bash',
  windows:
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"'
} as const
const minimumClaudeCodeVersion = '2.1.119'

export interface ClaudeCodeAgentProviderContributionOptions {
  readonly baseArgs?: readonly string[]
  readonly command?: string
  readonly createSessionId?: () => string
  readonly detector?: AgentProviderDetector
  readonly runtimeExecutable?: string
}

export class ClaudeCodeAgentProviderContribution implements AgentProviderContribution {
  readonly descriptor = {
    capabilities: {
      activityTracking: true,
      nativeMessages: true,
      initialPrompt: true,
      cleancodeMcp: true,
      launchInstructions: true,
      resume: true,
      sessionIdentityCapture: true,
      sessionRefCodec: true
    },
    displayName: 'Claude Code',
    documentationUrl: 'https://docs.anthropic.com/claude/docs/claude-code',
    icon: claudeCodeProviderIcon,
    id: 'claude-code',
    launch: {
      defaultArguments: [],
      defaultEnvironment: {},
      executable: 'claude',
      permission: { arguments: ['--dangerously-skip-permissions'] }
    }
  } as const
  readonly detector: AgentProviderDetector
  readonly sessionRefCodec: AgentProviderSessionRefCodec = new ClaudeCodeSessionRefCodec()
  readonly resume: AgentResumeStrategy = new ClaudeCodeResumeStrategy(this.sessionRefCodec)
  readonly telemetry: AgentTelemetryContribution
  readonly cleancodeCapability: AgentCapabilityInjector = new ClaudeCodeCapabilityInjector()
  readonly launcher: AgentLaunchPlanner

  constructor(options: ClaudeCodeAgentProviderContributionOptions = {}) {
    this.detector =
      options.detector ??
      new NodeAgentProviderCliDetector({
        executable: options.command ?? 'claude',
        installCommand: resolveAgentProviderInstallCommand(claudeCodeInstallCommands),
        minimumVersion: minimumClaudeCodeVersion,
        providerId: this.descriptor.id
      })
    this.telemetry = new ClaudeCodeTelemetryContribution(
      options.runtimeExecutable ?? process.execPath
    )
    this.launcher = new ClaudeCodeLaunchPlanner({
      baseArgs: options.baseArgs ?? [],
      capability: this.cleancodeCapability,
      command: options.command ?? 'claude',
      createSessionId: options.createSessionId ?? randomUUID,
      resume: this.resume,
      sessionRefCodec: this.sessionRefCodec,
      telemetry: this.telemetry
    })
  }
}

class ClaudeCodeResumeStrategy implements AgentResumeStrategy {
  constructor(private readonly sessionRefCodec: AgentProviderSessionRefCodec) {}

  createResumeArgs(sessionRef: ProviderSessionRefSnapshot): readonly string[] {
    return ['--resume', this.sessionRefCodec.parse(sessionRef).value]
  }
}

class ClaudeCodeSessionRefCodec implements AgentProviderSessionRefCodec {
  parse(sessionRef: ProviderSessionRefSnapshot): ProviderSessionRefSnapshot {
    const parsed = ProviderSessionRef.create(sessionRef).toSnapshot()
    if (parsed.formatVersion !== 1 || parsed.kind !== 'claude-session' || !isUuid(parsed.value)) {
      throw createExpectedAppError(
        'AGENT_SESSION_INVALID',
        'Unsupported Claude Code Provider session reference.',
        { providerId: 'claude-code' }
      )
    }
    return parsed
  }
}

class ClaudeCodeCapabilityInjector implements AgentCapabilityInjector {
  async inject(command: Parameters<AgentCapabilityInjector['inject']>[0]) {
    const config = await createTemporaryProviderConfig(
      'cleancode-claude-mcp-',
      'mcp.json',
      JSON.stringify({
        mcpServers: {
          cleancode: {
            headers: { Authorization: 'Bearer ${CLEANCODE_MCP_TOKEN}' },
            type: 'http',
            url: command.serverUrl
          }
        }
      })
    )
    command.artifacts.track('claude-mcp-config', config)
    const instructions = await createTemporaryProviderConfig(
      'cleancode-claude-instructions-',
      'instructions.txt',
      cleancodeMcpDeveloperInstructions
    )
    command.artifacts.track('claude-mcp-instructions', instructions)
    return {
      args: [
        '--mcp-config',
        config.path,
        '--allowedTools',
        'mcp__cleancode__*',
        '--append-system-prompt-file',
        instructions.path
      ],
      env: { CLEANCODE_MCP_TOKEN: command.bearerToken }
    }
  }
}

class ClaudeCodeTelemetryContribution implements AgentTelemetryContribution {
  readonly signals = { activity: true, sessionIdentity: true } as const

  constructor(private readonly runtimeExecutable: string) {}

  async prepare(command: CreateAgentLaunchPlanCommand) {
    const inbox =
      command.messageDelivery && supportsAgentProviderVersion(command.providerVersion, '2.1.261')
        ? command.artifacts.track('claude-inbox-signal', await ClaudeCodeInboxSignal.create())
        : undefined
    if (!inbox) command.messageDelivery?.(null)
    const reporter = await ClaudeCodeHookReporter.start({
      onFileChanged: (path) => inbox?.claim(path),
      onSessionStarted: () => {
        if (inbox) command.messageDelivery?.(inbox)
      },
      onActivityChanged: command.onActivityChanged ?? (() => undefined),
      onSessionIdentified: (sessionId) =>
        command.onProviderSessionIdentified({
          formatVersion: 1,
          kind: 'claude-session',
          metadata: { confirmedBy: 'session-hook' },
          value: sessionId
        }),
      workspaceDirectory: command.workspaceDirectory
    })
    command.artifacts.track('claude-hook-reporter', reporter)
    const relay = await createTemporaryProviderConfig(
      'cleancode-claude-hook-',
      'relay.mjs',
      claudeHookRelayScript
    )
    command.artifacts.track('claude-hook-relay', relay)
    const settings = await createTemporaryProviderConfig(
      'cleancode-claude-settings-',
      'settings.json',
      JSON.stringify({
        hooks: createClaudeHooks(this.runtimeExecutable, [relay.path], inbox?.path)
      })
    )
    command.artifacts.track('claude-hook-settings', settings)
    return {
      args: ['--settings', settings.path],
      env: {
        CLEANCODE_CLAUDE_HOOK_TOKEN: reporter.token,
        CLEANCODE_CLAUDE_HOOK_URL: reporter.url,
        ELECTRON_RUN_AS_NODE: '1'
      }
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
      readonly sessionRefCodec: AgentProviderSessionRefCodec
      readonly telemetry: AgentTelemetryContribution
    }
  ) {}

  async createLaunchPlan(command: CreateAgentLaunchPlanCommand) {
    const telemetry = await this.options.telemetry.prepare(command)
    const userArgs = await mergeClaudeCodeLaunchSettings(
      [...this.options.baseArgs, ...(command.launchProfile?.arguments ?? [])],
      telemetry.args[telemetry.args.indexOf('--settings') + 1]!,
      command.workspaceDirectory
    )
    const sessionArgs = command.providerSessionRef
      ? this.options.resume.createResumeArgs(command.providerSessionRef)
      : this.createSessionArgs()
    const capability = command.cleancodeMcp
      ? await this.options.capability.inject({
          ...command.cleancodeMcp,
          artifacts: command.artifacts
        })
      : { args: [], env: {} }
    const launchArgs = command.cleancodeMcp
      ? await mergeClaudeCodeLaunchInstructions(
          userArgs,
          capability.args[capability.args.indexOf('--append-system-prompt-file') + 1]!,
          command.workspaceDirectory
        )
      : userArgs
    return {
      args: [
        ...launchArgs,
        ...sessionArgs,
        ...capability.args,
        ...telemetry.args,
        ...(command.initialPrompt ? ['--', command.initialPrompt] : [])
      ],
      env: {
        ...(command.launchProfile?.environment ?? {}),
        ...capability.env,
        ...telemetry.env,
        ...createAgentProviderLoopbackEnvironment()
      },
      executable: command.launchProfile?.executable ?? this.options.command
    }
  }

  private createSessionArgs(): readonly string[] {
    const sessionRef = this.options.sessionRefCodec.parse({
      formatVersion: 1,
      kind: 'claude-session',
      value: this.options.createSessionId()
    })
    return ['--session-id', sessionRef.value]
  }
}

function createClaudeHooks(command: string, args: readonly string[], signalPath?: string) {
  const handler = { hooks: [{ args, command, type: 'command' }] }
  return {
    ...(signalPath
      ? {
          FileChanged: [
            { matcher: signalPath, ...handler },
            { hooks: [{ args, command, type: 'command', asyncRewake: true, timeout: 5 }] }
          ]
        }
      : {}),
    Notification: [handler],
    PermissionRequest: [handler],
    PreToolUse: [handler],
    SessionEnd: [handler],
    SessionStart: [{ matcher: 'startup|resume|clear|compact', ...handler }],
    Stop: [handler],
    UserPromptSubmit: [handler]
  }
}

const claudeHookRelayScript = [
  "let body='';",
  'for await (const chunk of process.stdin) body+=chunk;',
  'const response=await fetch(process.env.CLEANCODE_CLAUDE_HOOK_URL,{',
  'method:"POST",',
  'headers:{authorization:`Bearer ${process.env.CLEANCODE_CLAUDE_HOOK_TOKEN}`},',
  'body,signal:AbortSignal.timeout(3000)',
  '}).catch(()=>null);',
  'if(response?.status===200){process.stderr.write(await response.text());process.exitCode=2;}'
].join('')

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
