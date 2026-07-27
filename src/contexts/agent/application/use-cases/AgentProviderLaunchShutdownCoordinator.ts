import type { AgentLaunchPlan } from '../ports/AgentProviderContribution'
import type { AgentTerminalRuntimePort } from '../ports/AgentTerminalRuntimePort'

interface AgentProviderLaunchShutdownSession {
  readonly isTerminalRunning: boolean
  readonly providerLaunchGeneration: number
  readonly sessionId: string
}

interface ProviderLaunchShutdownRuntime {
  readonly exited: Promise<void>
  readonly hasExited: boolean
  readonly inputIntervalMs: number
  readonly inputs: readonly string[]
  readonly markExited: () => void
  readonly providerLaunchGeneration: number
  request?: Promise<void>
  readonly timeoutMs: number
}

export class AgentProviderLaunchShutdownCoordinator {
  private readonly launches = new WeakMap<
    AgentProviderLaunchShutdownSession,
    ProviderLaunchShutdownRuntime
  >()

  constructor(private readonly terminalRuntime: Pick<AgentTerminalRuntimePort, 'write'>) {}

  trackLaunch(
    session: AgentProviderLaunchShutdownSession,
    providerLaunchGeneration: number,
    strategy: AgentLaunchPlan['gracefulShutdown']
  ): () => void {
    if (!strategy) {
      this.launches.delete(session)
      return () => undefined
    }
    const shutdown = createProviderLaunchShutdownRuntime(providerLaunchGeneration, strategy)
    this.launches.set(session, shutdown)
    return shutdown.markExited
  }

  forget(session: AgentProviderLaunchShutdownSession): void {
    this.launches.delete(session)
  }

  async request(session: AgentProviderLaunchShutdownSession): Promise<void> {
    const shutdown = this.launches.get(session)
    if (
      !shutdown ||
      shutdown.hasExited ||
      shutdown.providerLaunchGeneration !== session.providerLaunchGeneration ||
      !session.isTerminalRunning
    ) {
      return
    }

    shutdown.request ??= this.performRequest(session, shutdown)
    await shutdown.request
  }

  private async performRequest(
    session: AgentProviderLaunchShutdownSession,
    shutdown: ProviderLaunchShutdownRuntime
  ): Promise<void> {
    for (const [index, input] of shutdown.inputs.entries()) {
      if (shutdown.hasExited) return
      this.terminalRuntime.write(session.sessionId, input)
      if (index < shutdown.inputs.length - 1) {
        const exited = await waitForProviderLaunchExit(shutdown.exited, shutdown.inputIntervalMs)
        if (exited) return
      }
    }
    if (!shutdown.hasExited) {
      await waitForProviderLaunchExit(shutdown.exited, shutdown.timeoutMs)
    }
  }
}

function createProviderLaunchShutdownRuntime(
  providerLaunchGeneration: number,
  strategy: NonNullable<AgentLaunchPlan['gracefulShutdown']>
): ProviderLaunchShutdownRuntime {
  let hasExited = false
  let resolveExit: () => void = () => undefined
  const exited = new Promise<void>((resolve) => {
    resolveExit = resolve
  })
  return {
    exited,
    get hasExited() {
      return hasExited
    },
    inputIntervalMs: strategy.inputIntervalMs,
    inputs: strategy.inputs,
    markExited: () => {
      if (hasExited) return
      hasExited = true
      resolveExit()
    },
    providerLaunchGeneration,
    timeoutMs: strategy.timeoutMs
  }
}

async function waitForProviderLaunchExit(
  exited: Promise<void>,
  timeoutMs: number
): Promise<boolean> {
  const normalizedTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : 0
  if (normalizedTimeoutMs === 0) return false

  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (didExit: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(didExit)
    }
    const timeout = setTimeout(() => finish(false), normalizedTimeoutMs)
    timeout.unref?.()
    void exited.then(() => finish(true))
  })
}
