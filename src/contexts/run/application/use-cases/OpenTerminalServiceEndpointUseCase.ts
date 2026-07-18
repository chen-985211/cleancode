import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { isSameTerminalRun } from '../../domain/value-objects/TerminalRunScope'
import type { ManagedServiceRunSnapshot } from '../services/ManagedServiceLauncher'
import type { ServiceEndpointOpenerPort } from '../ports/ServiceEndpointOpenerPort'

interface ManagedServiceRunLookup {
  getActive(sessionId: string): ManagedServiceRunSnapshot | null
}

export interface OpenTerminalServiceEndpointCommand {
  readonly runId: string
  readonly sessionId: string
  readonly generation: number
}

export class OpenTerminalServiceEndpointUseCase {
  constructor(
    private readonly managedServices: ManagedServiceRunLookup,
    private readonly opener: ServiceEndpointOpenerPort
  ) {}

  async execute(command: OpenTerminalServiceEndpointCommand): Promise<void> {
    const run = this.managedServices.getActive(command.sessionId)

    if (
      !run ||
      !isSameTerminalRun(run.scope, command) ||
      run.lease.state !== 'bound' ||
      !run.endpoint.openable ||
      (run.endpoint.protocol !== 'http' && run.endpoint.protocol !== 'https')
    ) {
      throw createExpectedAppError(
        'SERVICE_ENDPOINT_NOT_OPENABLE',
        'The local service endpoint is not available for this terminal run.'
      )
    }

    await this.opener.open(run.endpoint.displayAddress)
  }
}
