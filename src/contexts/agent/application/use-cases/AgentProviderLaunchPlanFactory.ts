import type {
  AgentLaunchPlan,
  AgentProviderContribution,
  AgentProviderLaunchProfile,
  CreateAgentLaunchPlanCommand
} from '../ports/AgentProviderContribution'
import { AgentLaunchArtifactScope } from '../services/AgentLaunchArtifactScope'
import { disposeAgentLaunchArtifacts, type ManagedAgentSession } from './AgentSessionRuntimeState'

export async function createManagedAgentLaunchPlan(command: {
  readonly launchProfile?: AgentProviderLaunchProfile
  readonly onActivityChanged: NonNullable<CreateAgentLaunchPlanCommand['onActivityChanged']>
  readonly onProviderSessionIdentified: CreateAgentLaunchPlanCommand['onProviderSessionIdentified']
  readonly onTurnCompleted: NonNullable<CreateAgentLaunchPlanCommand['onTurnCompleted']>
  readonly provider: AgentProviderContribution
  readonly session: ManagedAgentSession
}): Promise<AgentLaunchPlan> {
  const {
    launchProfile,
    onActivityChanged,
    onProviderSessionIdentified,
    onTurnCompleted,
    provider,
    session
  } = command
  const artifacts = new AgentLaunchArtifactScope()
  session.launchArtifacts = artifacts
  try {
    const plan = await provider.launcher.createLaunchPlan({
      artifacts,
      cleancodeMcp: session.mcpRegistration
        ? {
            bearerToken: session.mcpRegistration.bearerToken,
            serverUrl: session.mcpRegistration.url
          }
        : undefined,
      ...(launchProfile ? { launchProfile } : {}),
      onActivityChanged,
      onProviderSessionIdentified,
      onTurnCompleted,
      providerSessionRef: session.providerSessionRef ?? undefined,
      workspaceDirectory: session.workspaceDirectory
    })
    artifacts.seal()
    return plan
  } catch (error) {
    artifacts.seal()
    try {
      await disposeAgentLaunchArtifacts(session)
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Agent launch setup and artifact cleanup both failed.'
      )
    }
    throw error
  }
}
