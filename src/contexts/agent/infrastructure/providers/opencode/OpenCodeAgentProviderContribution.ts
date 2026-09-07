import { pathToFileURL } from 'node:url'

import { createExpectedAppError } from '../../../../../shared-kernel/application/errors/AppError'
import { agentInboxWakeupPrompt } from '../../../application/ports/AgentMessageDeliveryPort'
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
import { openCodeProviderIcon } from '../shared/AgentProviderBrandIcons'
import { createAgentProviderLoopbackEnvironment } from '../shared/AgentProviderLoopbackEnvironment'
import { NodeAgentProviderCliDetector } from '../shared/NodeAgentProviderCliDetector'
import {
  createTemporaryProviderConfig,
  type TemporaryProviderConfig
} from '../shared/TemporaryProviderConfig'
import { openCodeReporterPluginScript } from './OpenCodeReporterPlugin'
import { OpenCodeNativeMessageDelivery } from './OpenCodeNativeMessageDelivery'
import { OpenCodeEventReporter, isOpenCodeSessionId } from './OpenCodeEventReporter'
import { createOpenCodeLaunchConfig, parseInheritedOpenCodeConfig } from './OpenCodeLaunchConfig'

export const openCodeInstallCommands = {
  linux: 'curl -fsSL https://opencode.ai/install | bash',
  macos: 'curl -fsSL https://opencode.ai/install | bash',
  windows: 'npm install -g opencode-ai'
} as const

export interface OpenCodeAgentProviderContributionOptions {
  readonly baseArgs?: readonly string[]
  readonly command?: string
  readonly detector?: AgentProviderDetector
}

export class OpenCodeAgentProviderContribution implements AgentProviderContribution {
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
    displayName: 'OpenCode',
    documentationUrl: 'https://opencode.ai/docs/cli/',
    icon: openCodeProviderIcon,
    id: 'opencode',
    launch: {
      defaultArguments: [],
      defaultEnvironment: {},
      executable: 'opencode'
    }
  } as const
  readonly detector: AgentProviderDetector
  readonly sessionRefCodec: AgentProviderSessionRefCodec = new OpenCodeSessionRefCodec()
  readonly resume: AgentResumeStrategy = new OpenCodeResumeStrategy(this.sessionRefCodec)
  readonly telemetry: AgentTelemetryContribution
  readonly cleancodeCapability: AgentCapabilityInjector = new OpenCodeCapabilityInjector()
  readonly launcher: AgentLaunchPlanner

  constructor(options: OpenCodeAgentProviderContributionOptions = {}) {
    this.detector =
      options.detector ??
      new NodeAgentProviderCliDetector({
        executable: options.command ?? 'opencode',
        installCommand: resolveAgentProviderInstallCommand(openCodeInstallCommands),
        providerId: this.descriptor.id
      })
    const telemetry = new OpenCodeTelemetryContribution()
    this.telemetry = telemetry
    this.launcher = new OpenCodeLaunchPlanner({
      baseArgs: options.baseArgs ?? [],
      capability: this.cleancodeCapability,
      command: options.command ?? 'opencode',
      resume: this.resume,
      sessionRefCodec: this.sessionRefCodec,
      telemetry
    })
  }
}

class OpenCodeSessionRefCodec implements AgentProviderSessionRefCodec {
  parse(sessionRef: ProviderSessionRefSnapshot): ProviderSessionRefSnapshot {
    const parsed = ProviderSessionRef.create(sessionRef).toSnapshot()
    if (
      parsed.formatVersion !== 1 ||
      parsed.kind !== 'opencode-session' ||
      !isOpenCodeSessionId(parsed.value)
    ) {
      throw createExpectedAppError(
        'AGENT_SESSION_INVALID',
        'Unsupported OpenCode Provider session reference.',
        { providerId: 'opencode' }
      )
    }
    return parsed
  }
}

class OpenCodeResumeStrategy implements AgentResumeStrategy {
  constructor(private readonly sessionRefCodec: AgentProviderSessionRefCodec) {}

  createResumeArgs(sessionRef: ProviderSessionRefSnapshot): readonly string[] {
    return ['--session', this.sessionRefCodec.parse(sessionRef).value]
  }
}

class OpenCodeCapabilityInjector implements AgentCapabilityInjector {
  inject(command: Parameters<AgentCapabilityInjector['inject']>[0]) {
    return {
      args: [],
      env: { CLEANCODE_OPENCODE_MCP_TOKEN: command.bearerToken }
    }
  }
}

interface OpenCodeTelemetryPreparation {
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly pluginUrl: string
}

class OpenCodeTelemetryContribution implements AgentTelemetryContribution {
  readonly signals = { activity: true, sessionIdentity: true } as const

  prepare(command: Parameters<AgentTelemetryContribution['prepare']>[0]) {
    return this.prepareForLaunch(command)
  }

  async prepareForLaunch(
    command: CreateAgentLaunchPlanCommand,
    expectedSessionId?: string
  ): Promise<OpenCodeTelemetryPreparation> {
    const delivery = command.messageDelivery
      ? command.artifacts.track(
          'opencode-native-delivery',
          new OpenCodeNativeMessageDelivery(command.messageDelivery)
        )
      : undefined
    const reporter = await OpenCodeEventReporter.start({
      onNativeMessageUnavailable: () => command.messageDelivery?.(null),
      onNativeMessageEndpoint: (url, token) => delivery?.bindEndpoint(url, token),
      expectedSessionId,
      onActivityChanged: command.onActivityChanged ?? (() => undefined),
      onSessionIdentified: (sessionId, confirmedBy) => {
        delivery?.bindSession(sessionId)
        command.onProviderSessionIdentified({
          formatVersion: 1,
          kind: 'opencode-session',
          metadata: { confirmedBy },
          value: sessionId
        })
      },
      workspaceDirectory: command.workspaceDirectory
    })
    command.artifacts.track('opencode-event-reporter', reporter)
    const plugin: TemporaryProviderConfig = await createTemporaryProviderConfig(
      'cleancode-opencode-plugin-',
      'cleancode-reporter.mjs',
      openCodeReporterPluginScript
    )
    command.artifacts.track('opencode-reporter-plugin', plugin)
    return {
      args: [],
      env: {
        CLEANCODE_OPENCODE_REPORTER_TOKEN: reporter.token,
        ...(delivery ? { CLEANCODE_OPENCODE_NATIVE_MESSAGES: '1' } : {}),
        ...(expectedSessionId ? { CLEANCODE_OPENCODE_SESSION_ID: expectedSessionId } : {}),
        CLEANCODE_OPENCODE_REPORTER_URL: reporter.url
      },
      pluginUrl: pathToFileURL(plugin.path).href
    }
  }
}

class OpenCodeLaunchPlanner implements AgentLaunchPlanner {
  constructor(
    private readonly options: {
      readonly baseArgs: readonly string[]
      readonly capability: AgentCapabilityInjector
      readonly command: string
      readonly resume: AgentResumeStrategy
      readonly sessionRefCodec: AgentProviderSessionRefCodec
      readonly telemetry: OpenCodeTelemetryContribution
    }
  ) {}

  async createLaunchPlan(command: CreateAgentLaunchPlanCommand) {
    const inheritedConfig = parseInheritedOpenCodeConfig(
      command.launchProfile?.environment.OPENCODE_CONFIG_CONTENT ??
        process.env.OPENCODE_CONFIG_CONTENT
    )
    const sessionRef = command.providerSessionRef
      ? this.options.sessionRefCodec.parse(command.providerSessionRef)
      : undefined
    const telemetry = await this.options.telemetry.prepareForLaunch(command, sessionRef?.value)
    const capability = command.cleancodeMcp
      ? await this.options.capability.inject({
          ...command.cleancodeMcp,
          artifacts: command.artifacts
        })
      : { args: [], env: {} }
    const instructions = command.cleancodeMcp
      ? await createTemporaryProviderConfig(
          'cleancode-opencode-instructions-',
          'CLEANCODE.md',
          cleancodeMcpDeveloperInstructions
        )
      : undefined
    if (instructions) command.artifacts.track('opencode-mcp-instructions', instructions)

    // A fresh native TUI has no session until its first prompt. Establish it through
    // the same official initial-prompt path used by MCP-created Agents.
    const initialPrompt =
      command.initialPrompt ??
      (command.messageDelivery && command.cleancodeMcp && !sessionRef
        ? agentInboxWakeupPrompt
        : undefined)
    return {
      args: [
        ...this.options.baseArgs,
        ...(command.launchProfile?.arguments ?? []),
        ...(sessionRef ? this.options.resume.createResumeArgs(sessionRef) : []),
        ...capability.args,
        ...telemetry.args,
        ...(initialPrompt ? ['--prompt', initialPrompt] : []),
        command.workspaceDirectory
      ],
      env: {
        ...(command.launchProfile?.environment ?? {}),
        ...capability.env,
        ...telemetry.env,
        ...createAgentProviderLoopbackEnvironment(),
        OPENCODE_CONFIG_CONTENT: createOpenCodeLaunchConfig({
          inherited: inheritedConfig,
          instructionPath: instructions?.path,
          mcp: command.cleancodeMcp ? { serverUrl: command.cleancodeMcp.serverUrl } : undefined,
          pluginUrl: telemetry.pluginUrl
        })
      },
      executable: command.launchProfile?.executable ?? this.options.command
    }
  }
}
