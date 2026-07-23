import type {
  AgentLaunchPlanner,
  AgentProviderContribution,
  AgentProviderDescriptor,
  AgentProviderDetector
} from '../../../application/ports/AgentProviderContribution'
import { NodeAgentProviderCommandDetector } from '../shared/NodeAgentProviderCommandDetector'
import { createAgentProviderLoopbackEnvironment } from '../shared/AgentProviderLoopbackEnvironment'

export interface TerminalCliAgentProviderOptions {
  readonly command?: string
  readonly detector?: AgentProviderDetector
}

interface TerminalCliAgentProviderConfig {
  readonly args: readonly string[]
  readonly providerId: string
}

export const baselineTerminalCliCapabilities = {
  activityTracking: false,
  cleancodeMcp: 'unsupported',
  launchInstructions: false,
  resume: false,
  sessionIdentityCapture: false,
  sessionRefCodec: false
} as const

export abstract class TerminalCliAgentProviderContribution implements AgentProviderContribution {
  abstract readonly descriptor: AgentProviderDescriptor
  readonly detector: AgentProviderDetector
  readonly launcher: AgentLaunchPlanner

  protected constructor(
    config: TerminalCliAgentProviderConfig,
    options: TerminalCliAgentProviderOptions
  ) {
    const command = options.command ?? config.providerId
    this.detector =
      options.detector ??
      new NodeAgentProviderCommandDetector({
        executable: command,
        providerId: config.providerId
      })
    this.launcher = {
      createLaunchPlan: async () => ({
        args: config.args,
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          PROMPT_EOL_MARK: '',
          ...createAgentProviderLoopbackEnvironment()
        },
        executable: command
      })
    }
  }
}
