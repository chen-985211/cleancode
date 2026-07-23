import type {
  AgentProviderDescriptor,
  AgentProviderLaunchConfiguration
} from '../../../application/ports/AgentProviderContribution'
import type { AgentProviderIcon } from '../../../application/ports/AgentProviderContribution'
import {
  baselineTerminalCliCapabilities,
  TerminalCliAgentProviderContribution
} from '../terminal-cli/TerminalCliContribution'

export interface CatalogTerminalCliProviderConfig {
  readonly detectionExecutable?: string
  readonly displayName: string
  readonly documentationUrl: string
  readonly executableAliases?: readonly string[]
  readonly icon: AgentProviderIcon
  readonly id: string
  readonly launch: AgentProviderLaunchConfiguration
  readonly requiredExecutables?: readonly string[]
}

export class CatalogTerminalCliProvider extends TerminalCliAgentProviderContribution {
  readonly descriptor: AgentProviderDescriptor

  constructor(config: CatalogTerminalCliProviderConfig) {
    super(
      {
        detectionExecutable: config.detectionExecutable,
        executableAliases: config.executableAliases,
        launch: config.launch,
        providerId: config.id,
        requiredExecutables: config.requiredExecutables
      },
      {}
    )
    this.descriptor = {
      capabilities: baselineTerminalCliCapabilities,
      displayName: config.displayName,
      documentationUrl: config.documentationUrl,
      icon: config.icon,
      id: config.id,
      launch: config.launch
    }
  }
}
