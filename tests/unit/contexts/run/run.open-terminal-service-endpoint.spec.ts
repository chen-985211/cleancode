import { OpenTerminalServiceEndpointUseCase } from '../../../../src/contexts/run/application/use-cases/OpenTerminalServiceEndpointUseCase'
import type { ManagedServiceRunSnapshot } from '../../../../src/contexts/run/application/services/ManagedServiceLauncher'

describe('OpenTerminalServiceEndpointUseCase', () => {
  it('opens the Run-authoritative HTTP endpoint for the exact generation', async () => {
    const run = createManagedRun()
    const opener = { open: vi.fn(async () => undefined) }
    const useCase = new OpenTerminalServiceEndpointUseCase({ getActive: vi.fn(() => run) }, opener)

    await useCase.execute({
      runId: run.scope.runId,
      sessionId: run.scope.sessionId,
      generation: run.scope.generation
    })

    expect(opener.open).toHaveBeenCalledWith(run.endpoint.displayAddress)
  })

  it.each([
    ['stale generation', { runId: 'run-1', sessionId: 'session-1', generation: 1 }],
    ['unknown session', { runId: 'run-1', sessionId: 'missing', generation: 2 }]
  ])('rejects a %s without opening an external address', async (_label, command) => {
    const opener = { open: vi.fn(async () => undefined) }
    const useCase = new OpenTerminalServiceEndpointUseCase(
      { getActive: vi.fn((sessionId) => (sessionId === 'session-1' ? createManagedRun() : null)) },
      opener
    )

    await expect(useCase.execute(command)).rejects.toMatchObject({
      code: 'SERVICE_ENDPOINT_NOT_OPENABLE',
      isExpected: true
    })
    expect(opener.open).not.toHaveBeenCalled()
  })

  it('rejects TCP endpoints even when the Run identity is current', async () => {
    const run = createManagedRun({ protocol: 'tcp', openable: false })
    const opener = { open: vi.fn(async () => undefined) }
    const useCase = new OpenTerminalServiceEndpointUseCase({ getActive: vi.fn(() => run) }, opener)

    await expect(
      useCase.execute({
        runId: run.scope.runId,
        sessionId: run.scope.sessionId,
        generation: run.scope.generation
      })
    ).rejects.toMatchObject({ code: 'SERVICE_ENDPOINT_NOT_OPENABLE' })
    expect(opener.open).not.toHaveBeenCalled()
  })
})

function createManagedRun(
  endpoint: { readonly protocol: 'http' | 'tcp'; readonly openable: boolean } = {
    protocol: 'http',
    openable: true
  }
): ManagedServiceRunSnapshot {
  const scope = {
    projectId: 'project-1',
    projectDirectory: '/repo/app',
    workspaceName: 'main',
    workspaceDirectory: '/repo/app',
    gitBranch: 'main',
    blockId: 'api',
    sessionId: 'session-1',
    runId: 'run-1',
    generation: 2
  }
  const actualEndpoint = {
    protocol: endpoint.protocol,
    host: '127.0.0.1' as const,
    port: 41_001,
    requestedPort: 3_000,
    fallback: true,
    displayAddress: `${endpoint.protocol}://127.0.0.1:41001`,
    openable: endpoint.openable
  }
  return {
    scope,
    session: {
      ...scope,
      id: scope.sessionId,
      terminalBlockId: scope.blockId,
      workingDirectory: scope.workspaceDirectory,
      processId: 101,
      status: 'running',
      kind: 'direct',
      retentionPolicy: 'terminate-on-application-exit',
      recoveryKind: 'fresh',
      inputHistory: [],
      exitCode: null,
      failureReason: null
    },
    endpoint: actualEndpoint,
    lease: {
      id: 'lease-1',
      owner: scope,
      endpoint: actualEndpoint,
      state: 'bound',
      quarantineReason: null
    }
  }
}
