import { piProviderIcon } from '../shared/AgentProviderBrandIcons'
import {
  baselineTerminalCliCapabilities,
  TerminalCliAgentProviderContribution,
  type TerminalCliAgentProviderOptions
} from '../terminal-cli/TerminalCliContribution'

export class PiAgentProviderContribution extends TerminalCliAgentProviderContribution {
  readonly descriptor = {
    capabilities: baselineTerminalCliCapabilities,
    displayName: 'Pi',
    documentationUrl: 'https://pi.dev',
    icon: piProviderIcon,
    id: 'pi'
  } as const

  constructor(options: TerminalCliAgentProviderOptions = {}) {
    super(
      {
        args: [],
        providerId: 'pi'
      },
      options
    )
  }
}
