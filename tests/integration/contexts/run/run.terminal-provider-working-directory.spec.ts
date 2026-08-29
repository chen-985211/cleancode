import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  StartTerminalProcessCommand,
  TerminalProcessPort
} from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import { createProviderEndpoint } from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'
import { TerminalProviderServer } from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderServer'
import { TerminalProviderTestClient } from '../../../support/terminalProviderTestClient'

describe('terminal provider working-directory events', () => {
  it('publishes deduplicated observations with a monotonic revision', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-cwd-'))
    const processes = new RecordingProcessPort()
    const server = new TerminalProviderServer({
      endpoint: createProviderEndpoint(rootDirectory),
      authToken: 'secret-token',
      instanceId: 'provider-1',
      recoveryDirectory: join(rootDirectory, 'recovery'),
      processes
    })

    try {
      await server.start()
      const client = await TerminalProviderTestClient.connect(
        createProviderEndpoint(rootDirectory),
        'secret-token'
      )
      await client.request('claimController', {
        controllerId: 'controller-1',
        processId: process.pid
      })
      await createAndStart(client)

      processes.emitOutput('\u001b]7;file://localhost/work/app/src\u0007')
      const first = await client.waitForEvent('terminal-working-directory')
      processes.emitOutput('\u001b]7;file://localhost/work/app/src\u0007')
      processes.emitOutput('\u001b]7;file://localhost/work/app/packages/ui\u0007')
      const second = await client.waitForEvent('terminal-working-directory', 2)

      expect(first.payload).toEqual({
        scope: identity,
        sessionId: 'session-1',
        workingDirectory: '/work/app/src',
        revision: 1
      })
      expect(second.payload).toEqual({
        scope: identity,
        sessionId: 'session-1',
        workingDirectory: '/work/app/packages/ui',
        revision: 2
      })
      client.close()
    } finally {
      await server.close()
      await rm(rootDirectory, { force: true, recursive: true })
    }
  })
})

const identity = {
  projectId: 'project-1',
  projectDirectory: '/work/app',
  workspaceId: 'main',
  workspaceDirectory: '/work/app',
  gitBranch: 'main',
  blockId: 'block-1',
  sessionId: 'session-1',
  runId: 'run-1',
  generation: 1
}

async function createAndStart(client: TerminalProviderTestClient): Promise<void> {
  await client.request('createModel', {
    command: {
      identity,
      columns: 80,
      rows: 24,
      workingDirectory: '/work/app',
      terminalSourceTheme: 'light'
    }
  })
  await client.request('startProcess', {
    command: {
      scope: identity,
      workingDirectory: '/work/app',
      columns: 80,
      rows: 24,
      terminalSourceTheme: 'light',
      sessionKind: 'interactive'
    }
  })
}

class RecordingProcessPort implements TerminalProcessPort {
  private startCommand: StartTerminalProcessCommand | null = null

  async start(command: StartTerminalProcessCommand) {
    this.startCommand = command
    return { processId: 4242 }
  }

  launchForegroundJob(): void {}
  write(): void {}
  resize(): void {}
  pauseOutput(): void {}
  resumeOutput(): void {}
  async readWorkingDirectory(): Promise<string> {
    return '/work/app'
  }
  async stop(): Promise<void> {}
  async disposeAll(): Promise<void> {}

  emitOutput(data: string): void {
    if (!this.startCommand) throw new Error('Missing provider process.')
    this.startCommand.onOutput({ scope: identity, sessionId: 'session-1', data })
  }
}
