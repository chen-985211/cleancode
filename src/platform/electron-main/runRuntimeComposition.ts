import { join } from 'node:path'

import { BrowserWindow, shell } from 'electron'

import type { RunRuntimeScopeValidationPort } from '../../contexts/run/application/ports/RunRuntimeScopeValidationPort'
import type { TerminalLaunchPlanPort } from '../../contexts/run/application/ports/TerminalLaunchPlanPort'
import type { TerminalWorkflowEvent } from '../../contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import type { TerminalWorkflowPlanPort } from '../../contexts/run/application/ports/TerminalWorkflowPlanPort'
import { LocalPortAllocator } from '../../contexts/run/application/services/LocalPortAllocator'
import { ManagedServiceLauncher } from '../../contexts/run/application/services/ManagedServiceLauncher'
import { LaunchTerminalCommandUseCase } from '../../contexts/run/application/use-cases/LaunchTerminalCommandUseCase'
import { OpenTerminalLinkUseCase } from '../../contexts/run/application/use-cases/OpenTerminalLinkUseCase'
import { OpenTerminalServiceEndpointUseCase } from '../../contexts/run/application/use-cases/OpenTerminalServiceEndpointUseCase'
import { RunLifecycleService } from '../../contexts/run/application/use-cases/RunLifecycleService'
import { RunRuntimeCoordinator } from '../../contexts/run/application/use-cases/RunRuntimeCoordinator'
import { TerminalSessionService } from '../../contexts/run/application/use-cases/TerminalSessionService'
import { TerminalWorkflowService } from '../../contexts/run/application/use-cases/TerminalWorkflowService'
import { ServicePortLeaseRegistry } from '../../contexts/run/domain/services/ServicePortLeaseRegistry'
import {
  createTerminalRunSlotKey,
  isSameTerminalRun
} from '../../contexts/run/domain/value-objects/TerminalRunScope'
import { NodeLocalPortReservationAdapter } from '../../contexts/run/infrastructure/network/NodeLocalPortReservationAdapter'
import { NodeTcpListenerInspectionAdapter } from '../../contexts/run/infrastructure/network/NodeTcpListenerInspectionAdapter'
import { TerminalSessionWorkflowRuntimeAdapter } from '../../contexts/run/infrastructure/pty/TerminalSessionWorkflowRuntimeAdapter'
import { NodeTcpReadinessAdapter } from '../../contexts/run/infrastructure/readiness/NodeTcpReadinessAdapter'
import {
  PersistentTerminalProviderClient,
  type PersistentTerminalProviderClientOptions
} from '../../contexts/run/infrastructure/provider/PersistentTerminalProviderClient'
import { NodeTerminalLinkFileSystemAdapter } from '../../contexts/run/infrastructure/filesystem/NodeTerminalLinkFileSystemAdapter'
import { consoleLogger } from '../logging/ConsoleLogSink'
import { createRunLifecycleAdapters } from './runLifecycleAdapters'
import type { ManagedServiceOwnerResolver } from './managedServiceOwnerResolver'
import { projectTerminalPortConflict } from './terminalPortConflictProjection'

export function createRunRuntime(input: {
  readonly appStateDirectory: string
  readonly launchPlans: TerminalLaunchPlanPort
  readonly resolveManagedServiceOwner: ManagedServiceOwnerResolver
  readonly resolveTerminalProviderLaunchTarget?: NonNullable<
    PersistentTerminalProviderClientOptions['resolveLaunchTarget']
  >
  readonly scopeValidation: RunRuntimeScopeValidationPort
  readonly workflowPlans: TerminalWorkflowPlanPort
}) {
  const lifecycle = new RunLifecycleService({ initialRuntimePhase: 'initializing' })
  const terminalProvider = new PersistentTerminalProviderClient({
    stateDirectory: join(input.appStateDirectory, 'terminal-runtime-provider'),
    providerEntryPath: join(__dirname, 'terminal-runtime-provider.js'),
    resolveLaunchTarget: input.resolveTerminalProviderLaunchTarget,
    onBackgroundError: logProviderError,
    onRuntimeUnavailable: () =>
      lifecycle.markRuntimeUnavailable('TERMINAL_PROVIDER_UNAVAILABLE', true),
    onOutput: (event) => broadcastRendererEvent('cleancode:terminal-output', event)
  })
  const sessions = new TerminalSessionService(
    terminalProvider,
    input.scopeValidation,
    lifecycle,
    terminalProvider,
    terminalProvider
  )
  const readiness = new NodeTcpReadinessAdapter()
  const leases = new ServicePortLeaseRegistry()
  const allocator = new LocalPortAllocator(new NodeLocalPortReservationAdapter(), leases, {
    isRunInactive: (scope) => {
      const session = sessions.getSession(scope.sessionId)
      return Boolean(
        session &&
        createTerminalRunSlotKey(session) === createTerminalRunSlotKey(scope) &&
        isSameTerminalRun(session, scope) &&
        (session.status === 'exited' || session.status === 'failed')
      )
    }
  })
  const managedServices = new ManagedServiceLauncher(
    sessions,
    allocator,
    readiness,
    new NodeTcpListenerInspectionAdapter(),
    lifecycle
  )
  const launchTerminal = new LaunchTerminalCommandUseCase(
    input.launchPlans,
    sessions,
    managedServices
  )
  const openTerminalServiceEndpoint = new OpenTerminalServiceEndpointUseCase(managedServices, {
    open: async (address) => {
      await shell.openExternal(address)
    }
  })
  const openTerminalLink = new OpenTerminalLinkUseCase(
    sessions,
    new NodeTerminalLinkFileSystemAdapter(),
    {
      openExternal: async (address) => shell.openExternal(address),
      openLocal: async ({ path }) => {
        const error = await shell.openPath(path)
        if (error) throw new Error(error)
      }
    }
  )
  const workflow = new TerminalWorkflowService(
    input.workflowPlans,
    new TerminalSessionWorkflowRuntimeAdapter(sessions),
    readiness,
    {
      publish: (event) => publishWorkflowEvent(event, input.resolveManagedServiceOwner)
    },
    managedServices,
    lifecycle
  )
  const runtimeCoordinator = new RunRuntimeCoordinator(
    lifecycle,
    () =>
      sessions.initializeRuntime({
        onOutput: () => undefined,
        onExit: (event) => broadcastRendererEvent('cleancode:terminal-exit', event),
        onSessionUpdated: (session) =>
          broadcastRendererEvent('cleancode:terminal-session-updated', session)
      }),
    async (recovery) => {
      await managedServices.recover(recovery.managedServiceEndpoints)
    }
  )
  lifecycle.subscribeRuntimeAvailability((availability) =>
    broadcastRendererEvent('cleancode:terminal-runtime-availability', availability)
  )

  return {
    ...createRunLifecycleAdapters(lifecycle),
    launchTerminal,
    lifecycle,
    managedServices,
    openTerminalServiceEndpoint,
    openTerminalLink,
    sessions,
    workflow,
    getRuntimeAvailability: () => lifecycle.getRuntimeAvailability(),
    initialize: () => runtimeCoordinator.initialize(),
    retryInitialize: () => runtimeCoordinator.retry()
  }
}

function publishWorkflowEvent(
  event: TerminalWorkflowEvent,
  resolveManagedServiceOwner: ManagedServiceOwnerResolver
): void {
  if (event.type === 'terminal-output') return
  if (event.type !== 'service-port-conflict') {
    broadcastRendererEvent('cleancode:terminal-workflow-event', event)
    return
  }

  void projectTerminalPortConflict(
    event.failure,
    resolveManagedServiceOwner,
    logOwnerResolutionError
  ).then((projected) => {
    if (projected) broadcastRendererEvent('cleancode:terminal-run-event', projected)
  })
}

function broadcastRendererEvent(channel: string, event: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, event)
  }
}

function logOwnerResolutionError(error: unknown): void {
  consoleLogger.warn({
    scope: 'run.terminal-workflow',
    operation: 'resolveManagedServiceOwner',
    outcome: 'failure',
    error: { message: error instanceof Error ? error.message : String(error) }
  })
}

function logProviderError(error: unknown): void {
  consoleLogger.warn({
    scope: 'run.terminal-provider',
    operation: 'providerBackgroundRequest',
    outcome: 'failure',
    error: { message: error instanceof Error ? error.message : String(error) }
  })
}
