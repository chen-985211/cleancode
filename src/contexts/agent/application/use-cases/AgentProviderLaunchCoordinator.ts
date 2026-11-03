import type { AgentExecutionDirectoryPort } from '../ports/AgentExecutionDirectoryPort'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { AgentTerminalRuntimePort } from '../ports/AgentTerminalRuntimePort'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'
import type { AgentRuntimeScopeValidationPort } from '../ports/AgentRuntimeScopeValidationPort'
import type { AgentProviderPreferencesRepository } from '../ports/AgentProviderPreferencesRepository'
import type { ProviderSessionRefSnapshot } from '../../domain/value-objects/ProviderSessionRef'
import type { AgentProviderAvailabilityService } from '../services/AgentProviderAvailabilityService'
import type { AgentMessageMailbox } from '../services/AgentMessageMailbox'
import type { ManagedAgentActivityRegistry } from './ManagedAgentActivityRegistry'
import type { AgentProviderSessionPersistenceCoordinator } from './AgentProviderSessionPersistenceCoordinator'
import type { AgentProviderLaunchShutdownCoordinator } from './AgentProviderLaunchShutdownCoordinator'
import { resolvePersistedAgentProviderLaunchProfile } from '../services/AgentProviderLaunchProfileResolver'
import { createManagedAgentLaunchPlan } from './AgentProviderLaunchPlanFactory'
import {
  beginAgentMcpInitializationTimeout,
  canLaunchAgentProvider,
  createAgentLaunchRuntimeController,
  disposeAgentLaunchArtifacts,
  transitionAgentRuntime,
  validateAgentProviderAvailability,
  validateManagedAgentRuntimeScope,
  type ManagedAgentSession
} from './AgentSessionRuntimeState'

export class AgentProviderLaunchCoordinator {
  constructor(
    private readonly terminalRuntime: AgentTerminalRuntimePort,
    private readonly providers: AgentProviderRegistryPort,
    private readonly scopeValidation: AgentRuntimeScopeValidationPort,
    private readonly providerAvailability: AgentProviderAvailabilityService,
    private readonly providerPreferences: AgentProviderPreferencesRepository,
    private readonly managedActivity: ManagedAgentActivityRegistry,
    private readonly persistence: AgentProviderSessionPersistenceCoordinator,
    private readonly providerLaunchShutdown: AgentProviderLaunchShutdownCoordinator,
    private readonly mailbox: AgentMessageMailbox,
    private readonly beginSessionToolClosing: (session: ManagedAgentSession) => void,
    private readonly settleSessionToolCalls: (session: ManagedAgentSession) => Promise<void>,
    private readonly executionDirectories: AgentExecutionDirectoryPort
  ) {}
  async launch(session: ManagedAgentSession, refresh = true): Promise<void> {
    await validateManagedAgentRuntimeScope(session, this.scopeValidation)
    await disposeAgentLaunchArtifacts(session)
    await this.persistence.waitForIdle()
    const providerLaunchGeneration = ++session.providerLaunchGeneration
    const processSessionId = session.sessionId
    if (!canLaunchAgentProvider(session, processSessionId)) return
    const provider = this.providers.require(session.providerId)
    await validateAgentProviderAvailability(provider, this.providerAvailability, refresh)
    const launchProfile = await resolvePersistedAgentProviderLaunchProfile(
      provider.descriptor.launch,
      this.providerPreferences,
      session.providerId
    )
    transitionAgentRuntime(session, {
      activity: 'unavailable',
      launch: { exitCode: null, failureKind: null, launchId: null, status: 'launching' }
    })
    const managedActivity = this.managedActivity.beginProviderLaunch(
      session,
      providerLaunchGeneration,
      provider.descriptor.capabilities.activityTracking
    )
    const persistProviderSessionRef = (sessionRef: ProviderSessionRefSnapshot | null): void => {
      if (
        !session.launchArtifacts ||
        session.sessionId !== processSessionId ||
        session.providerLaunchGeneration !== providerLaunchGeneration
      )
        return
      this.persistence.persist(session, sessionRef, providerLaunchGeneration)
    }
    const resolved = await this.executionDirectories.resolve({
      workspaceDirectory: session.workspaceDirectory,
      executionDirectory: session.executionDirectory ?? session.workspaceDirectory
    })
    if (!resolved)
      throw createExpectedAppError(
        'AGENT_SESSION_INVALID',
        'Agent execution directory is no longer available.'
      )
    if (session.executionDirectory) session.executionDirectory = resolved
    let directorySequence = 0
    const isCurrentLaunch = (): boolean =>
      Boolean(
        session.launchArtifacts &&
        session.sessionId === processSessionId &&
        session.providerLaunchGeneration === providerLaunchGeneration
      )
    const onExecutionDirectoryChanged = async (
      candidate: string,
      isCurrent?: () => boolean
    ): Promise<boolean> => {
      if (!isCurrentLaunch()) return false
      const sequence = ++directorySequence
      const directory = await this.executionDirectories.resolve({
        workspaceDirectory: session.workspaceDirectory,
        executionDirectory: candidate
      })
      if (
        !directory ||
        !isCurrentLaunch() ||
        isCurrent?.() === false ||
        sequence !== directorySequence
      )
        return false
      this.persistence.persistDirectory(session, directory, providerLaunchGeneration)
      session.executionDirectory = directory
      transitionAgentRuntime(session, { executionDirectory: directory })
      return true
    }
    const plan = await createManagedAgentLaunchPlan({
      mailbox: this.mailbox,
      providerVersion:
        launchProfile &&
        (launchProfile.executable !== provider.descriptor.launch?.executable ||
          Object.keys(launchProfile.environment).some((key) => key.toUpperCase() === 'PATH'))
          ? undefined
          : ((await this.providerAvailability.inspect(session.providerId)).version ?? undefined),
      ...(launchProfile ? { launchProfile } : {}),
      onActivityChanged: managedActivity.recordStatus,
      onExecutionDirectoryChanged,
      onProviderSessionIdentified: persistProviderSessionRef,
      onProviderSessionCleared: () => persistProviderSessionRef(null),
      onTurnCompleted: managedActivity.recordTurnCompleted,
      provider,
      session
    })
    try {
      if (plan.discardProviderSessionRef) await this.persistence.discardProviderSessionRef(session)
      if (!canLaunchAgentProvider(session, processSessionId)) {
        managedActivity.recordExit()
        await disposeAgentLaunchArtifacts(session)
        return
      }
      const lifecycle = createAgentLaunchRuntimeController({
        attempt: providerLaunchGeneration,
        onStartedAccepted: () => {
          if (provider.descriptor.capabilities.activityTracking) {
            managedActivity.recordStatus('idle')
          }
          if (plan.providerSessionRefOnStarted) {
            persistProviderSessionRef(plan.providerSessionRefOnStarted)
          }
          beginAgentMcpInitializationTimeout(session)
        },
        onUnexpectedExit: () => {
          this.beginSessionToolClosing(session)
          void this.settleSessionToolCalls(session)
        },
        session,
        sessionId: processSessionId
      })
      const markProviderLaunchExited = this.providerLaunchShutdown.trackLaunch(
        session,
        providerLaunchGeneration,
        plan.gracefulShutdown
      )
      const launch = this.terminalRuntime.launch({
        onExit: (event) => {
          managedActivity.recordExit()
          markProviderLaunchExited()
          lifecycle.onExit(event)
        },
        onStarted: lifecycle.onStarted,
        plan,
        sessionId: processSessionId
      })
      lifecycle.bind(launch)
    } catch (error) {
      managedActivity.recordExit()
      this.providerLaunchShutdown.forget(session)
      await disposeAgentLaunchArtifacts(session)
      throw error
    }
  }
}
