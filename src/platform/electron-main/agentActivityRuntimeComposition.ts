import { join } from 'node:path'

import type {
  AgentActivityRegistryEvent,
  AgentActivityTerminalScope,
  TerminalAgentActivitySnapshot
} from '../../contexts/agent/application/dto/AgentActivityProtocol'
import { AgentActivityRegistry } from '../../contexts/agent/application/services/AgentActivityRegistry'
import { AgentHookGateway } from '../../contexts/agent/infrastructure/terminal-activity/AgentHookGateway'
import { loadOrCreateAgentHookIdentitySigner } from '../../contexts/agent/infrastructure/terminal-activity/AgentHookIdentitySigner'
import { TerminalAgentActivityEnvironmentService } from '../../contexts/agent/infrastructure/terminal-activity/TerminalAgentActivityEnvironmentService'
import { TerminalAgentTelemetryAssetStore } from '../../contexts/agent/infrastructure/terminal-activity/TerminalAgentTelemetryAssetStore'
import type { TerminalLaunchEnvironmentPreparationPort } from '../../contexts/run/application/ports/TerminalLaunchEnvironmentPreparationPort'
import type { Logger } from '../logging/Logger'
import { TerminalAgentActivityIntegrationAdapter } from './terminalAgentActivityIntegrationAdapter'

interface AgentActivityRuntimeState {
  readonly gateway: AgentHookGateway
  readonly launchEnvironmentPreparation: TerminalLaunchEnvironmentPreparationPort
}

type OptionalInitializationResult<T> =
  { readonly status: 'ready'; readonly value: T } | { readonly status: 'timed_out' }

const defaultOptionalInitializationTimeoutMs = 500

export interface AgentActivityRuntime {
  dispose(): Promise<void>
  initialize(): Promise<void>
  readonly launchEnvironmentPreparation: TerminalLaunchEnvironmentPreparationPort
  readonly registry: AgentActivityRegistry
  list(): readonly TerminalAgentActivitySnapshot[]
  releaseTerminal(scope: AgentActivityTerminalScope): boolean
}

export function createAgentActivityRuntime(input: {
  readonly appStateDirectory: string
  readonly isTerminalScopeActive: (scope: AgentActivityTerminalScope) => boolean
  readonly logger: Logger
  readonly publish: (event: AgentActivityRegistryEvent) => void
  readonly quietWindowMs?: number
  readonly runtimeExecutable: string
  readonly optionalInitializationTimeoutMs?: number
}): AgentActivityRuntime {
  const registry = new AgentActivityRegistry({ quietWindowMs: input.quietWindowMs })
  const assets = new TerminalAgentTelemetryAssetStore({
    runtimeExecutable: input.runtimeExecutable,
    stateDirectory: input.appStateDirectory
  })
  const unsubscribe = registry.subscribe(input.publish)
  const optionalInitializationTimeoutMs = Math.max(
    0,
    input.optionalInitializationTimeoutMs ?? defaultOptionalInitializationTimeoutMs
  )
  let initialization: Promise<AgentActivityRuntimeState> | null = null
  let initializationGateway: AgentHookGateway | null = null
  let initializationTimeoutLogged = false
  let disposed = false
  let state: AgentActivityRuntimeState | null = null

  const initialize = async (): Promise<AgentActivityRuntimeState> => {
    if (!initialization) {
      const attempt = initializeRuntime()
      initialization = attempt
      void attempt.catch(() => {
        if (!disposed && initialization === attempt) initialization = null
      })
    }
    return initialization
  }
  const launchEnvironmentPreparation: TerminalLaunchEnvironmentPreparationPort = {
    prepare: async (command) => {
      if (disposed) {
        return { environment: command.environment, launchCommand: command.launchCommand }
      }
      try {
        const result = await waitForOptionalAgentActivityInitialization(
          initialize(),
          optionalInitializationTimeoutMs
        )
        if (result.status === 'timed_out') {
          if (!initializationTimeoutLogged) {
            initializationTimeoutLogged = true
            logInitializationFailure(
              input.logger,
              new Error(
                `Agent activity initialization exceeded ${optionalInitializationTimeoutMs}ms.`
              )
            )
          }
          return { environment: command.environment, launchCommand: command.launchCommand }
        }
        return await result.value.launchEnvironmentPreparation.prepare(command)
      } catch (error) {
        logInitializationFailure(input.logger, error)
        return { environment: command.environment, launchCommand: command.launchCommand }
      }
    }
  }

  return {
    dispose: async () => {
      disposed = true
      unsubscribe()
      await (state?.gateway ?? initializationGateway)?.dispose()
      registry.dispose()
    },
    initialize: async () => {
      await initialize()
    },
    launchEnvironmentPreparation,
    registry,
    list: () => registry.list(),
    releaseTerminal: (scope) => registry.releaseTerminal(scope)
  }

  async function initializeRuntime(): Promise<AgentActivityRuntimeState> {
    assertNotDisposed(disposed)
    const signer = await loadOrCreateAgentHookIdentitySigner(
      join(input.appStateDirectory, 'agent-activity', 'identity-secret')
    )
    assertNotDisposed(disposed)
    const gateway = await AgentHookGateway.start({
      authorize: (identity, token) => {
        try {
          return signer.verify(identity, token) && input.isTerminalScopeActive(identity.terminal)
        } catch {
          return false
        }
      },
      onReport: (command) => {
        if (!registry.registerTerminal(command.identity.terminal)) return
        registry.record(command)
      }
    })
    initializationGateway = gateway
    try {
      assertNotDisposed(disposed)
      const environment = new TerminalAgentActivityEnvironmentService({
        assets,
        platform: process.platform,
        signer
      })
      await environment.initialize(gateway.url)
      assertNotDisposed(disposed)
      const initialized = {
        gateway,
        launchEnvironmentPreparation: new TerminalAgentActivityIntegrationAdapter({
          environment,
          logger: input.logger
        })
      }
      state = initialized
      return initialized
    } catch (error) {
      await gateway.dispose()
      if (initializationGateway === gateway) initializationGateway = null
      throw error
    }
  }
}

export function waitForOptionalAgentActivityInitialization<T>(
  initialization: Promise<T>,
  timeoutMs: number
): Promise<OptionalInitializationResult<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<OptionalInitializationResult<T>>((resolve) => {
    timeout = setTimeout(() => resolve({ status: 'timed_out' }), Math.max(0, timeoutMs))
  })
  return Promise.race([
    initialization.then<OptionalInitializationResult<T>>((value) => ({ status: 'ready', value })),
    timedOut
  ]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout)
  })
}

function assertNotDisposed(disposed: boolean): void {
  if (disposed) throw new Error('Agent activity runtime has already been disposed.')
}

function logInitializationFailure(logger: Logger, error: unknown): void {
  try {
    logger.warn({
      error: { message: error instanceof Error ? error.message : String(error) },
      operation: 'initializeAgentActivityRuntime',
      outcome: 'failure',
      scope: 'agent.terminal-activity'
    })
  } catch {
    // Optional telemetry remains fail-open when diagnostics are unavailable.
  }
}
