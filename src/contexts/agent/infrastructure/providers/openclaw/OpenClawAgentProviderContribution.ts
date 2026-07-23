import { openClawProviderIcon } from '../shared/AgentProviderBrandIcons'
import {
  baselineTerminalCliCapabilities,
  TerminalCliAgentProviderContribution,
  type TerminalCliAgentProviderOptions
} from '../terminal-cli/TerminalCliContribution'

const openClawLaunch = {
  defaultArguments: ['tui'],
  defaultEnvironment: {},
  executable: 'openclaw'
} as const

export class OpenClawAgentProviderContribution extends TerminalCliAgentProviderContribution {
  readonly descriptor = {
    capabilities: baselineTerminalCliCapabilities,
    displayName: 'OpenClaw',
    documentationUrl: 'https://github.com/openclaw/openclaw',
    icon: openClawProviderIcon,
    id: 'openclaw',
    launch: openClawLaunch
  } as const

  constructor(options: TerminalCliAgentProviderOptions = {}) {
    super(
      {
        launch: openClawLaunch,
        providerId: 'openclaw'
      },
      options
    )
  }
}
