import { hermesProviderIcon } from '../shared/AgentProviderBrandIcons'
import {
  baselineTerminalCliCapabilities,
  TerminalCliAgentProviderContribution,
  type TerminalCliAgentProviderOptions
} from '../terminal-cli/TerminalCliContribution'

const hermesLaunch = {
  defaultArguments: ['--tui'],
  defaultEnvironment: {},
  executable: 'hermes',
  permission: { arguments: ['--yolo'] }
} as const

export class HermesAgentProviderContribution extends TerminalCliAgentProviderContribution {
  readonly descriptor = {
    capabilities: baselineTerminalCliCapabilities,
    displayName: 'Hermes',
    documentationUrl: 'https://hermes-agent.nousresearch.com/docs/',
    icon: hermesProviderIcon,
    id: 'hermes',
    launch: hermesLaunch
  } as const

  constructor(options: TerminalCliAgentProviderOptions = {}) {
    super(
      {
        launch: hermesLaunch,
        providerId: 'hermes'
      },
      options
    )
  }
}
