import { openClawProviderIcon } from '../shared/AgentProviderBrandIcons'
import {
  baselineTerminalCliCapabilities,
  TerminalCliAgentProviderContribution,
  type TerminalCliAgentProviderOptions
} from '../terminal-cli/TerminalCliContribution'

export class OpenClawAgentProviderContribution extends TerminalCliAgentProviderContribution {
  readonly descriptor = {
    capabilities: baselineTerminalCliCapabilities,
    displayName: 'OpenClaw',
    documentationUrl: 'https://github.com/openclaw/openclaw',
    icon: openClawProviderIcon,
    id: 'openclaw'
  } as const

  constructor(options: TerminalCliAgentProviderOptions = {}) {
    super(
      {
        args: [],
        providerId: 'openclaw'
      },
      options
    )
  }
}
