import { piProviderIcon } from '../shared/AgentProviderBrandIcons'
import { createReportedTerminalCliSession } from '../terminal-cli/ReportedTerminalCliSession'
import { PiSessionTelemetry } from './PiSessionTelemetry'
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
    capabilities: {
      ...baselineTerminalCliCapabilities,
      resume: true,
      sessionIdentityCapture: true,
      sessionRefCodec: true
    },
    displayName: 'Pi',
    documentationUrl: 'https://pi.dev',
    icon: piProviderIcon,
    id: 'pi',
    launch: piLaunch
  } as const

  constructor(options: TerminalCliAgentProviderOptions = {}) {
    const session = createReportedTerminalCliSession('pi')
    super(
      {
        launch: piLaunch,
        providerId: 'pi',
        session,
        telemetry: new PiSessionTelemetry(session.sessionRefCodec)
      },
      options
    )
  }
}
