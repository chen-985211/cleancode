import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  StartTerminalProcessCommand,
  TerminalProcessPort
} from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import {
  PersistentTerminalProviderClient,
  type PersistentTerminalProviderClientOptions
} from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClient'
import {
  atomicWriteProviderMetadata,
  createProviderEndpoint
} from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'
import { terminalProviderProtocolVersion } from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'
import { TerminalProviderServer } from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderServer'

describe('terminal provider private output control', () => {
  let rootDirectory = ''
  let server: TerminalProviderServer | null = null

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-private-output-'))
  })

  afterEach(async () => {
    await server?.close()
    await rm(rootDirectory, { force: true, recursive: true })
  })

  it('transports private control separately from the public process environment', async () => {
    const endpoint = createProviderEndpoint(rootDirectory)
    const processes = new RecordingProcessPort()
    server = new TerminalProviderServer({
      endpoint,
      authToken: 'secret-token',
      instanceId: 'provider-1',
      recoveryDirectory: join(rootDirectory, 'recovery'),
      processes
    })
    await server.start()
    await atomicWriteProviderMetadata(join(rootDirectory, 'provider.json'), {
      schemaVersion: 1,
      protocolVersion: terminalProviderProtocolVersion,
      instanceId: 'provider-1',
      authToken: 'secret-token',
      endpoint,
      processId: process.pid,
      startedAt: new Date().toISOString()
    })
    const client = createClient(rootDirectory)
    const scope = terminalIdentity()
    await client.initialize()
    client.create({
      identity: scope,
      columns: 80,
      rows: 24,
      workingDirectory: scope.workspaceDirectory,
      terminalSourceTheme: 'light',
      onFlowControlChange: () => undefined,
      onQueryResponse: () => undefined
    })

    await client.start({
      scope,
      workingDirectory: scope.workspaceDirectory,
      environment: { PUBLIC_ENVIRONMENT: 'visible' },
      privateOutputControl: {
        protocol: 'osc-633-span-v1',
        token: 'private-output-token',
        environment: { CLEANCODE_PRIVATE_OUTPUT_TOKEN: 'private-output-token' }
      },
      columns: 80,
      rows: 24,
      onOutput: vi.fn(),
      onExit: vi.fn()
    })

    expect(processes.starts).toHaveLength(1)
    expect(processes.starts[0]?.environment).toEqual({ PUBLIC_ENVIRONMENT: 'visible' })
    expect(processes.starts[0]?.privateOutputControl).toEqual({
      protocol: 'osc-633-span-v1',
      token: 'private-output-token',
      environment: { CLEANCODE_PRIVATE_OUTPUT_TOKEN: 'private-output-token' }
    })
    await client.detachApplication()
  })
})

function createClient(rootDirectory: string) {
  return new PersistentTerminalProviderClient({
    stateDirectory: rootDirectory,
    providerEntryPath: join(rootDirectory, 'unused-provider-entry.js')
  } satisfies PersistentTerminalProviderClientOptions)
}

function terminalIdentity() {
  return {
    blockId: 'block-1',
    generation: 1,
    gitBranch: 'main',
    projectDirectory: '/work/app',
    projectId: 'project-1',
    runId: 'run-1',
    sessionId: 'session-1',
    workspaceDirectory: '/work/app',
    workspaceId: 'main'
  }
}

class RecordingProcessPort implements TerminalProcessPort {
  readonly starts: StartTerminalProcessCommand[] = []

  async start(command: StartTerminalProcessCommand): Promise<{ readonly processId: number }> {
    this.starts.push(command)
    return { processId: 4242 }
  }

  write(): void {}
  resize(): void {}
  pauseOutput(): void {}
  resumeOutput(): void {}
  async readWorkingDirectory(): Promise<string> {
    return '/work/app'
  }
  async stop(sessionId: string): Promise<void> {
    const command = this.starts.find((candidate) => candidate.scope.sessionId === sessionId)
    command?.onExit({ scope: command.scope, sessionId, exitCode: 0 })
  }
  async disposeAll(): Promise<void> {
    await Promise.all(this.starts.map((command) => this.stop(command.scope.sessionId)))
  }
}
