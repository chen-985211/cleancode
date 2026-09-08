import { hermesProviderIcon } from '../shared/AgentProviderBrandIcons'
import { createReportedTerminalCliSession } from '../terminal-cli/ReportedTerminalCliSession'
import { HermesSessionTelemetry } from './HermesSessionTelemetry'
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
    capabilities: {
      ...baselineTerminalCliCapabilities,
      activityTracking: true,
      resume: true,
      sessionIdentityCapture: true,
      sessionRefCodec: true
    },
    displayName: 'Hermes',
    documentationUrl: 'https://hermes-agent.nousresearch.com/docs/',
    icon: hermesProviderIcon,
    id: 'hermes',
    launch: hermesLaunch
  } as const

  constructor(options: TerminalCliAgentProviderOptions = {}) {
    const session = createReportedTerminalCliSession('hermes')
    super(
      {
        launch: hermesLaunch,
        providerId: 'hermes',
        session,
        telemetry: new HermesSessionTelemetry(session.sessionRefCodec)
      },
      options
    )
  }
}
