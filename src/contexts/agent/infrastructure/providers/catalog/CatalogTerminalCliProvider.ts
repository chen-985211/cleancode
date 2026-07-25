import type {
  AgentCapabilityInjector,
  AgentProviderDescriptor,
  AgentProviderLaunchConfiguration
} from '../../../application/ports/AgentProviderContribution'
import type { AgentProviderIcon } from '../../../application/ports/AgentProviderContribution'
import {
  baselineTerminalCliCapabilities,
  TerminalCliAgentProviderContribution
} from '../terminal-cli/TerminalCliContribution'
import type { DeclarativeTerminalCliSession } from '../terminal-cli/DeclarativeTerminalCliSession'

export interface CatalogTerminalCliProviderConfig {
  readonly detectionExecutable?: string
  readonly displayName: string
  readonly documentationUrl: string
  readonly executableAliases?: readonly string[]
  readonly icon: AgentProviderIcon
  readonly id: string
  readonly launch: AgentProviderLaunchConfiguration
  readonly mcp?: {
    readonly injector: AgentCapabilityInjector
    readonly launchInstructions?: boolean
  }
  readonly requiredExecutables?: readonly string[]
  readonly session?: DeclarativeTerminalCliSession
}

export class CatalogTerminalCliProvider extends TerminalCliAgentProviderContribution {
  readonly descriptor: AgentProviderDescriptor

  constructor(config: CatalogTerminalCliProviderConfig) {
    super(
      {
        detectionExecutable: config.detectionExecutable,
        cleancodeCapability: config.mcp?.injector,
        executableAliases: config.executableAliases,
        launch: config.launch,
        providerId: config.id,
        requiredExecutables: config.requiredExecutables,
        session: config.session
      },
      {}
    )
    this.descriptor = {
      capabilities:
        config.session || config.mcp
          ? {
              activityTracking: false,
              cleancodeMcp: Boolean(config.mcp),
              launchInstructions: config.mcp?.launchInstructions ?? false,
              resume: Boolean(config.session),
              sessionIdentityCapture: Boolean(config.session),
              sessionRefCodec: Boolean(config.session)
            }
          : baselineTerminalCliCapabilities,
      displayName: config.displayName,
      documentationUrl: config.documentationUrl,
      icon: config.icon,
      id: config.id,
      launch: config.launch
    }
  }
}
