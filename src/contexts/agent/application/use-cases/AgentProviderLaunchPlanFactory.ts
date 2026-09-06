import type {
  AgentLaunchPlan,
  AgentProviderContribution,
  AgentProviderLaunchProfile,
  CreateAgentLaunchPlanCommand
} from '../ports/AgentProviderContribution'
import { AgentLaunchArtifactScope } from '../services/AgentLaunchArtifactScope'
import { disposeAgentLaunchArtifacts, type ManagedAgentSession } from './AgentSessionRuntimeState'
import type { AgentMessageMailbox } from '../services/AgentMessageMailbox'

export async function createManagedAgentLaunchPlan(command: {
  readonly mailbox?: AgentMessageMailbox
  readonly providerVersion?: string
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
  const delivery = session.mcpRegistration
    ? command.mailbox?.registerDelivery(session, () => ({
        running: !session.isStopping && session.runtime.launch.status === 'running',
        mcpReady: session.runtime.mcp.status === 'ready',
        activity: session.runtime.activity.status
      }))
    : undefined
  session.messageDelivery = delivery
  if (!provider.descriptor.capabilities.nativeMessages) delivery?.setWakeup(null)
  try {
    const plan = await provider.launcher.createLaunchPlan({
      ...(delivery && provider.descriptor.capabilities.nativeMessages
        ? { messageDelivery: delivery.setWakeup.bind(delivery) }
        : {}),
      providerVersion: command.providerVersion,
      ...(session.initialPrompt ? { initialPrompt: session.initialPrompt } : {}),
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
    if (delivery) artifacts.track('agent-inbox-delivery', delivery)
    artifacts.seal()
    return plan
  } catch (error) {
    await delivery?.dispose()
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
