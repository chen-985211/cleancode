import type {
  AgentLaunchPlanner,
  AgentProviderContribution,
  AgentProviderDescriptor,
  AgentProviderDetector,
  AgentProviderLaunchConfiguration
} from '../../../application/ports/AgentProviderContribution'
import { NodeAgentProviderCommandDetector } from '../shared/NodeAgentProviderCommandDetector'
import { createAgentProviderLoopbackEnvironment } from '../shared/AgentProviderLoopbackEnvironment'

export interface TerminalCliAgentProviderOptions {
  readonly command?: string
  readonly detector?: AgentProviderDetector
}

interface TerminalCliAgentProviderConfig {
  readonly detectionExecutable?: string
  readonly executableAliases?: readonly string[]
  readonly launch: AgentProviderLaunchConfiguration
  readonly providerId: string
  readonly requiredExecutables?: readonly string[]
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
    const command = options.command ?? config.launch.executable
    this.detector =
      options.detector ??
      new NodeAgentProviderCommandDetector({
        executable: options.command ?? config.detectionExecutable ?? config.launch.executable,
        executableAliases: config.executableAliases,
        providerId: config.providerId,
        requiredExecutables: config.requiredExecutables
      })
    this.launcher = {
      createLaunchPlan: async (launchCommand) => ({
        args: launchCommand.launchProfile?.arguments ?? config.launch.defaultArguments,
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          PROMPT_EOL_MARK: '',
          ...createAgentProviderLoopbackEnvironment(),
          ...(launchCommand.launchProfile?.environment ?? config.launch.defaultEnvironment)
        },
        executable: launchCommand.launchProfile?.executable ?? command
      })
    }
  }
}
