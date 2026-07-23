import type { ManagedAgentSession } from './AgentSessionRuntimeState'
import { disposeAgentLaunchArtifacts } from './AgentSessionRuntimeState'

interface AgentApplicationShutdownOperations {
  readonly beginClosing: (session: ManagedAgentSession) => void
  readonly clearRuntime: () => void
  readonly clearSessions: () => void
  readonly disposeMcpServer: () => void
  readonly forgetSession: (sessionId: string) => void
  readonly listSessions: () => readonly ManagedAgentSession[]
  readonly releaseTerminalReferences: () => void
  readonly settleTools: (session: ManagedAgentSession) => Promise<void>
  readonly stopAdmission: () => void
  readonly waitForAdmissionIdle: () => Promise<void>
  readonly waitForPersistence: () => Promise<void>
}

export class AgentApplicationShutdownCoordinator {
  private completion: Promise<void> | null = null
  private preparation: Promise<void> | null = null

  constructor(private readonly operations: AgentApplicationShutdownOperations) {}

  prepare(): Promise<void> {
    if (this.preparation) return this.preparation
    this.operations.stopAdmission()
    const initialClosing = this.operations
      .listSessions()
      .map((session) => settle(() => this.operations.beginClosing(session)))
    this.preparation = this.prepareResources(initialClosing)
    return this.preparation
  }

  complete(): Promise<void> {
    this.completion ??= this.completeAfterPreparation()
    return this.completion
  }

  private async completeAfterPreparation(): Promise<void> {
    let preparationFailure: unknown
    try {
      await this.prepare()
    } catch (error) {
      preparationFailure = error
    }

    const sessions = this.operations.listSessions()
    let releaseFailure: unknown
    try {
      this.operations.releaseTerminalReferences()
    } catch (error) {
      releaseFailure = error
    } finally {
      this.operations.clearSessions()
      this.operations.clearRuntime()
      for (const session of sessions) this.operations.forgetSession(session.sessionId)
    }
    if (preparationFailure !== undefined && releaseFailure !== undefined) {
      throw new AggregateError(
        [preparationFailure, releaseFailure],
        'Agent application shutdown preparation and completion both failed.'
      )
    }
    if (preparationFailure !== undefined) throw preparationFailure
    if (releaseFailure !== undefined) throw releaseFailure
  }

  private async prepareResources(
    initialClosing: readonly Promise<PromiseSettledResult<void>>[]
  ): Promise<void> {
    const results: PromiseSettledResult<unknown>[] = await Promise.all(initialClosing)
    results.push(await settle(this.operations.waitForAdmissionIdle))
    const sessions = this.operations.listSessions()
    results.push(
      ...(await Promise.all(
        sessions.map((session) => settle(() => this.operations.beginClosing(session)))
      )),
      ...(await Promise.all(
        sessions.map((session) => settle(() => this.operations.settleTools(session)))
      )),
      ...(await Promise.all(
        sessions.map((session) => settle(() => disposeAgentLaunchArtifacts(session)))
      )),
      await settle(this.operations.waitForPersistence),
      await settle(this.operations.disposeMcpServer)
    )

    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : []
    )
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        'One or more Agent application shutdown resources failed to prepare.'
      )
    }
  }
}

async function settle(operation: () => void | Promise<void>): Promise<PromiseSettledResult<void>> {
  try {
    await operation()
    return { status: 'fulfilled', value: undefined }
  } catch (reason) {
    return { reason, status: 'rejected' }
  }
}
