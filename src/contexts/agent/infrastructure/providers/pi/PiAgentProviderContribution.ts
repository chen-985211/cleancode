import { piProviderIcon } from '../shared/AgentProviderBrandIcons'
import {
  baselineTerminalCliCapabilities,
  TerminalCliAgentProviderContribution,
  type TerminalCliAgentProviderOptions
} from '../terminal-cli/TerminalCliContribution'

const piLaunch = {
  defaultArguments: [],
  defaultEnvironment: {},
  executable: 'pi'
} as const

export class PiAgentProviderContribution extends TerminalCliAgentProviderContribution {
  readonly descriptor = {
    capabilities: baselineTerminalCliCapabilities,
    displayName: 'Pi',
    documentationUrl: 'https://pi.dev',
    icon: piProviderIcon,
    id: 'pi',
    launch: piLaunch
  } as const

  constructor(options: TerminalCliAgentProviderOptions = {}) {
    super(
      {
        launch: piLaunch,
        providerId: 'pi'
      },
      options
    )
  }
}
