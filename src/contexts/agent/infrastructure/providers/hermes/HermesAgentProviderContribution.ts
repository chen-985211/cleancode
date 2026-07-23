import { hermesProviderIcon } from '../shared/AgentProviderBrandIcons'
import {
  baselineTerminalCliCapabilities,
  TerminalCliAgentProviderContribution,
  type TerminalCliAgentProviderOptions
} from '../terminal-cli/TerminalCliContribution'

export class HermesAgentProviderContribution extends TerminalCliAgentProviderContribution {
  readonly descriptor = {
    capabilities: baselineTerminalCliCapabilities,
    displayName: 'Hermes',
    documentationUrl: 'https://hermes-agent.nousresearch.com/docs/',
    icon: hermesProviderIcon,
    id: 'hermes'
  } as const

  constructor(options: TerminalCliAgentProviderOptions = {}) {
    super(
      {
        args: ['--tui'],
        providerId: 'hermes'
      },
      options
    )
  }
}
