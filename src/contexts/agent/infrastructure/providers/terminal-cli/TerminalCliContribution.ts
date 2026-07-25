import type {
  AgentCapabilityInjector,
  AgentFreshSessionStrategy,
  AgentLaunchPlanner,
  AgentProviderContribution,
  AgentProviderDescriptor,
  AgentProviderDetector,
  AgentProviderLaunchConfiguration,
  AgentProviderSessionRefCodec,
  AgentResumeStrategy
} from '../../../application/ports/AgentProviderContribution'
import { NodeAgentProviderCommandDetector } from '../shared/NodeAgentProviderCommandDetector'
import { createAgentProviderLoopbackEnvironment } from '../shared/AgentProviderLoopbackEnvironment'
import type { DeclarativeTerminalCliSession } from './DeclarativeTerminalCliSession'

export interface TerminalCliAgentProviderOptions {
  readonly command?: string
  readonly detector?: AgentProviderDetector
}

interface TerminalCliAgentProviderConfig {
  readonly cleancodeCapability?: AgentCapabilityInjector
  readonly detectionExecutable?: string
  readonly executableAliases?: readonly string[]
  readonly launch: AgentProviderLaunchConfiguration
  readonly providerId: string
  readonly requiredExecutables?: readonly string[]
  readonly session?: DeclarativeTerminalCliSession
}

export const baselineTerminalCliCapabilities = {
  activityTracking: false,
  cleancodeMcp: false,
  launchInstructions: false,
  resume: false,
  sessionIdentityCapture: false,
  sessionRefCodec: false
} as const

export abstract class TerminalCliAgentProviderContribution implements AgentProviderContribution {
  abstract readonly descriptor: AgentProviderDescriptor
  readonly cleancodeCapability?: AgentCapabilityInjector
  readonly detector: AgentProviderDetector
  readonly freshSession?: AgentFreshSessionStrategy
  readonly launcher: AgentLaunchPlanner
  readonly resume?: AgentResumeStrategy
  readonly sessionRefCodec?: AgentProviderSessionRefCodec

  protected constructor(
    config: TerminalCliAgentProviderConfig,
    options: TerminalCliAgentProviderOptions
  ) {
    const command = options.command ?? config.launch.executable
    this.cleancodeCapability = config.cleancodeCapability
    this.freshSession = config.session?.freshSession
    this.resume = config.session?.resume
    this.sessionRefCodec = config.session?.sessionRefCodec
    this.detector =
      options.detector ??
      new NodeAgentProviderCommandDetector({
        executable: options.command ?? config.detectionExecutable ?? config.launch.executable,
        executableAliases: config.executableAliases,
        providerId: config.providerId,
        requiredExecutables: config.requiredExecutables
      })
    this.launcher = {
      createLaunchPlan: async (launchCommand) => {
        const session = launchCommand.providerSessionRef
          ? {
              args: this.resume?.createResumeArgs(launchCommand.providerSessionRef) ?? [],
              sessionRef: undefined
            }
          : (this.freshSession?.createFreshSession() ?? {
              args: [],
              sessionRef: undefined
            })
        const capability =
          launchCommand.cleancodeMcp && this.cleancodeCapability
            ? await this.cleancodeCapability.inject({
                ...launchCommand.cleancodeMcp,
                artifacts: launchCommand.artifacts
              })
            : { args: [], env: {} }

        return {
          args: [
            ...(launchCommand.launchProfile?.arguments ?? config.launch.defaultArguments),
            ...session.args,
            ...capability.args
          ],
          env: {
            ELECTRON_RUN_AS_NODE: '1',
            PROMPT_EOL_MARK: '',
            ...createAgentProviderLoopbackEnvironment(),
            ...(launchCommand.launchProfile?.environment ?? config.launch.defaultEnvironment),
            ...capability.env
          },
          executable: launchCommand.launchProfile?.executable ?? command,
          ...(session.sessionRef ? { providerSessionRefOnStarted: session.sessionRef } : {})
        }
      }
    }
  }
}
