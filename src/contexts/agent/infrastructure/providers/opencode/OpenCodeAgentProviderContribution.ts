import type {
  AgentLaunchPlanner,
  AgentProviderContribution,
  AgentProviderDetector
} from '../../../application/ports/AgentProviderContribution'
import { NodeAgentProviderCliDetector } from '../shared/NodeAgentProviderCliDetector'

const openCodeInstallCommand = 'curl -fsSL https://opencode.ai/install | bash'

export interface OpenCodeAgentProviderContributionOptions {
  readonly baseArgs?: readonly string[]
  readonly command?: string
  readonly detector?: AgentProviderDetector
}

export class OpenCodeAgentProviderContribution implements AgentProviderContribution {
  readonly descriptor = {
    capabilities: {
      cleancodeMcp: false,
      resume: false,
      structuredLifecycle: false,
      systemInstructions: false
    },
    displayName: 'OpenCode',
    id: 'opencode'
  } as const
  readonly detector: AgentProviderDetector
  readonly launcher: AgentLaunchPlanner

  constructor(options: OpenCodeAgentProviderContributionOptions = {}) {
    this.detector =
      options.detector ??
      new NodeAgentProviderCliDetector({
        executable: options.command ?? 'opencode',
        installCommand: openCodeInstallCommand,
        providerId: this.descriptor.id
      })
    this.launcher = {
      createLaunchPlan: async (command) => ({
        args: [...(options.baseArgs ?? []), command.workspaceDirectory],
        env: {},
        executable: options.command ?? 'opencode',
        temporaryArtifacts: []
      })
    }
  }
}
