import { randomUUID } from 'node:crypto'

import type {
  AgentCapabilityInjector,
  AgentFreshSessionStrategy,
  AgentLaunchPlanner,
  AgentProviderContribution,
  AgentProviderDetector,
  AgentProviderSessionRefCodec,
  AgentResumeStrategy,
  AgentTelemetryContribution,
  CreateAgentLaunchPlanCommand
} from '../../../application/ports/AgentProviderContribution'
import { createCatalogProviderIcon } from '../catalog/CatalogProviderIcons'
import { createAgentProviderLoopbackEnvironment } from '../shared/AgentProviderLoopbackEnvironment'
import { NodeAgentProviderCommandDetector } from '../shared/NodeAgentProviderCommandDetector'
import { createTemporaryProviderConfig } from '../shared/TemporaryProviderConfig'
import { createClientAssignedTerminalCliSession } from '../terminal-cli/DeclarativeTerminalCliSession'
import { GeminiHookReporter } from './GeminiHookReporter'

export interface GeminiAgentProviderContributionOptions {
  readonly baseArgs?: readonly string[]
  readonly command?: string
  readonly createSessionId?: () => string
  readonly detector?: AgentProviderDetector
  readonly runtimeExecutable?: string
}

export class GeminiAgentProviderContribution implements AgentProviderContribution {
  readonly descriptor = {
    capabilities: {
      activityTracking: false,
      cleancodeMcp: true,
      launchInstructions: false,
      resume: true,
      sessionIdentityCapture: true,
      sessionRefCodec: true
    },
    displayName: 'Gemini',
    documentationUrl: 'https://github.com/google-gemini/gemini-cli',
    icon: createCatalogProviderIcon('gemini'),
    id: 'gemini',
    launch: {
      defaultArguments: [],
      defaultEnvironment: {},
      executable: 'gemini',
      permission: { arguments: ['--approval-mode=yolo'] }
    }
  } as const
  readonly cleancodeCapability: GeminiMcpCapabilityInjector
  readonly detector: AgentProviderDetector
  readonly freshSession: AgentFreshSessionStrategy
  readonly launcher: AgentLaunchPlanner
  readonly resume: AgentResumeStrategy
  readonly sessionRefCodec: AgentProviderSessionRefCodec
  readonly telemetry: GeminiTelemetryContribution

  constructor(options: GeminiAgentProviderContributionOptions = {}) {
    const command = options.command ?? 'gemini'
    const session = createClientAssignedTerminalCliSession({
      createArgs: (sessionId) => ['--session-id', sessionId],
      createSessionId: options.createSessionId ?? randomUUID,
      providerId: 'gemini',
      resumeArgs: (sessionId) => ['--resume', sessionId],
      sessionKind: 'gemini-session',
      validateSessionId: isUuid
    })
    this.cleancodeCapability = new GeminiMcpCapabilityInjector()
    this.detector =
      options.detector ??
      new NodeAgentProviderCommandDetector({
        executable: command,
        providerId: this.descriptor.id
      })
    this.freshSession = session.freshSession
    this.resume = session.resume
    this.sessionRefCodec = session.sessionRefCodec
    this.telemetry = new GeminiTelemetryContribution(options.runtimeExecutable ?? process.execPath)
    this.launcher = new GeminiLaunchPlanner({
      baseArgs: options.baseArgs ?? [],
      capability: this.cleancodeCapability,
      command,
      freshSession: this.freshSession,
      resume: this.resume,
      telemetry: this.telemetry
    })
  }
}

class GeminiMcpCapabilityInjector implements AgentCapabilityInjector {
  createSettings(serverUrl: string): Readonly<Record<string, unknown>> {
    return {
      mcpServers: {
        cleancode: {
          headers: { Authorization: 'Bearer ${CLEANCODE_MCP_TOKEN}' },
          httpUrl: serverUrl,
          trust: true
        }
      }
    }
  }

  async inject(command: Parameters<AgentCapabilityInjector['inject']>[0]) {
    const settings = await createTemporaryProviderConfig(
      'cleancode-gemini-settings-',
      'settings.json',
      JSON.stringify(this.createSettings(command.serverUrl))
    )
    command.artifacts.track('gemini-settings', settings)
    return {
      args: [],
      env: {
        CLEANCODE_MCP_TOKEN: command.bearerToken,
        GEMINI_CLI_SYSTEM_SETTINGS_PATH: settings.path
      }
    }
  }
}

interface GeminiTelemetryPreparation {
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

class GeminiTelemetryContribution implements AgentTelemetryContribution {
  readonly signals = { activity: false, sessionIdentity: true } as const

  constructor(private readonly runtimeExecutable: string) {}

  prepare(command: Parameters<AgentTelemetryContribution['prepare']>[0]) {
    return this.prepareForLaunch(command)
  }

  async prepareForLaunch(
    command: Parameters<AgentTelemetryContribution['prepare']>[0],
    settingsFragment: Readonly<Record<string, unknown>> = {}
  ): Promise<GeminiTelemetryPreparation> {
    const reporter = await GeminiHookReporter.start({
      onSessionIdentified: (sessionId) =>
        command.onProviderSessionIdentified({
          formatVersion: 1,
          kind: 'gemini-session',
          metadata: { confirmedBy: 'session-start-hook' },
          value: sessionId
        }),
      workspaceDirectory: command.workspaceDirectory
    })
    command.artifacts.track('gemini-hook-reporter', reporter)
    const relay = await createTemporaryProviderConfig(
      'cleancode-gemini-hook-',
      'relay.mjs',
      geminiHookRelayScript
    )
    command.artifacts.track('gemini-hook-relay', relay)
    const settings = await createTemporaryProviderConfig(
      'cleancode-gemini-settings-',
      'settings.json',
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  command: createHookCommand(this.runtimeExecutable, relay.path),
                  name: 'cleancode-session-reporter',
                  timeout: 5_000,
                  type: 'command'
                }
              ]
            }
          ]
        },
        ...settingsFragment
      })
    )
    command.artifacts.track('gemini-settings', settings)
    return {
      args: [],
      env: {
        CLEANCODE_GEMINI_HOOK_TOKEN: reporter.token,
        CLEANCODE_GEMINI_HOOK_URL: reporter.url,
        ELECTRON_RUN_AS_NODE: '1',
        GEMINI_CLI_SYSTEM_SETTINGS_PATH: settings.path
      }
    }
  }
}

class GeminiLaunchPlanner implements AgentLaunchPlanner {
  constructor(
    private readonly options: {
      readonly baseArgs: readonly string[]
      readonly capability: GeminiMcpCapabilityInjector
      readonly command: string
      readonly freshSession: AgentFreshSessionStrategy
      readonly resume: AgentResumeStrategy
      readonly telemetry: GeminiTelemetryContribution
    }
  ) {}

  async createLaunchPlan(command: CreateAgentLaunchPlanCommand) {
    const session = command.providerSessionRef
      ? {
          args: this.options.resume.createResumeArgs(command.providerSessionRef),
          sessionRef: undefined
        }
      : this.options.freshSession.createFreshSession()
    const telemetry = await this.options.telemetry.prepareForLaunch(
      command,
      command.cleancodeMcp
        ? this.options.capability.createSettings(command.cleancodeMcp.serverUrl)
        : undefined
    )
    return {
      args: [
        ...this.options.baseArgs,
        ...(command.launchProfile?.arguments ?? []),
        ...session.args,
        ...telemetry.args
      ],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        PROMPT_EOL_MARK: '',
        ...createAgentProviderLoopbackEnvironment(),
        ...(command.launchProfile?.environment ?? {}),
        ...telemetry.env,
        ...(command.cleancodeMcp ? { CLEANCODE_MCP_TOKEN: command.cleancodeMcp.bearerToken } : {})
      },
      executable: command.launchProfile?.executable ?? this.options.command,
      ...(session.sessionRef ? { providerSessionRefOnStarted: session.sessionRef } : {})
    }
  }
}

const geminiHookRelayScript = [
  "let body='';",
  'for await (const chunk of process.stdin) body+=chunk;',
  'await fetch(process.env.CLEANCODE_GEMINI_HOOK_URL,{',
  'method:"POST",',
  'headers:{authorization:`Bearer ${process.env.CLEANCODE_GEMINI_HOOK_TOKEN}`},',
  'body',
  '}).catch(()=>{});',
  "process.stdout.write('{}');"
].join('')

function createHookCommand(runtimeExecutable: string, relayPath: string): string {
  return [runtimeExecutable, relayPath].map(quoteCommandArgument).join(' ')
}

function quoteCommandArgument(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
