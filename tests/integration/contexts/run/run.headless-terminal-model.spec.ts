import { HeadlessTerminalModelAdapter } from '../../../../src/contexts/run/infrastructure/terminal-model/HeadlessTerminalModelAdapter'

describe('headless terminal model', () => {
  it('restores screen state, alternate buffer, modes and monotonic output sequence', async () => {
    const queryResponses: string[] = []
    const flowControl: boolean[] = []
    const adapter = new HeadlessTerminalModelAdapter()
    const identity = createIdentity()

    adapter.create({
      identity,
      columns: 40,
      rows: 8,
      workingDirectory: '/work/app',
      onQueryResponse: (response) => queryResponses.push(response),
      onFlowControlChange: (isPaused) => flowControl.push(isPaused)
    })

    expect(
      adapter.acceptOutput(
        identity,
        '\u001b]2;Build Logs\u0007\u001b]7;file://localhost/work/app/src\u0007\u001b[31mnormal\u001b[0m\r\n'
      ).sequence
    ).toBe(1)
    expect(
      adapter.acceptOutput(identity, '\u001b[?2004h\u001b[?1049h\u001b[32malternate').sequence
    ).toBe(2)

    const visibleOutput: Array<{ readonly sequence: number; readonly data: string }> = []
    const snapshot = await adapter.attachView({
      identity,
      viewId: 'view-1',
      onOutput: (event) => visibleOutput.push(event.output)
    })

    expect(snapshot.sequence).toBe(2)
    expect(snapshot.restoreMarker).toEqual({ viewId: 'view-1', sequence: 2 })
    expect(snapshot.content).toContain('normal')
    expect(snapshot.content).toContain('\u001b[?1049h')
    expect(snapshot.content).toContain('alternate')
    expect(snapshot.transcript).toContain('alternate')
    expect(snapshot.modes.bracketedPasteMode).toBe(true)
    expect(snapshot.dimensions).toEqual({ columns: 40, rows: 8 })
    expect(snapshot.title).toBe('Build Logs')
    expect(snapshot.workingDirectory).toBe('/work/app/src')

    adapter.acceptOutput(identity, '\r\nlive')

    expect(visibleOutput).toEqual([
      {
        sequence: 3,
        data: '\r\nlive'
      }
    ])
    expect(flowControl).toEqual([true, false])
    expect(queryResponses).toEqual([])
  })

  it('hands terminal query authority between the hidden model and the attached view', async () => {
    const queryResponses: string[] = []
    const adapter = new HeadlessTerminalModelAdapter()
    const identity = createIdentity()

    adapter.create({
      identity,
      columns: 80,
      rows: 24,
      workingDirectory: '/work/app',
      onQueryResponse: (response) => queryResponses.push(response),
      onFlowControlChange: () => undefined
    })
    adapter.acceptOutput(identity, '\u001b[6n')
    await adapter.flush(identity)

    expect(queryResponses).toEqual(['\u001b[1;1R'])

    await adapter.attachView({
      identity,
      viewId: 'view-1',
      onOutput: () => undefined
    })
    adapter.acceptOutput(identity, '\u001b[6n')
    await adapter.flush(identity)

    expect(queryResponses).toEqual(['\u001b[1;1R'])

    await adapter.detachView(identity, 'view-1')
    adapter.acceptOutput(identity, '\u001b[6n')
    await adapter.flush(identity)

    expect(queryResponses).toEqual(['\u001b[1;1R', '\u001b[1;1R'])
  })

  it('rejects stale identities and releases every model idempotently', async () => {
    const adapter = new HeadlessTerminalModelAdapter()
    const identity = createIdentity()

    adapter.create({
      identity,
      columns: 80,
      rows: 24,
      workingDirectory: '/work/app',
      onQueryResponse: () => undefined,
      onFlowControlChange: () => undefined
    })

    expect(() =>
      adapter.acceptOutput({ ...identity, generation: identity.generation + 1 }, 'stale')
    ).toThrowError(expect.objectContaining({ code: 'TERMINAL_MODEL_IDENTITY_MISMATCH' }))

    adapter.retire(identity)
    adapter.retire(identity)

    expect(adapter.getDiagnostics()).toMatchObject({ modelCount: 0, attachedViewCount: 0 })
    await expect(
      adapter.attachView({ identity, viewId: 'missing-view', onOutput: () => undefined })
    ).rejects.toMatchObject({ code: 'TERMINAL_MODEL_NOT_FOUND' })
  })

  it('applies bounded model backpressure and resumes after parsing drains', async () => {
    const flowControl: boolean[] = []
    const adapter = new HeadlessTerminalModelAdapter()
    const identity = createIdentity()
    adapter.create({
      identity,
      columns: 80,
      rows: 24,
      workingDirectory: '/work/app',
      onQueryResponse: () => undefined,
      onFlowControlChange: (isPaused) => flowControl.push(isPaused)
    })

    adapter.acceptOutput(identity, 'x'.repeat(1024 * 1024))
    expect(flowControl).toEqual([true])

    await adapter.flush(identity)

    expect(flowControl).toEqual([true, false])
    expect(adapter.getDiagnostics().pendingOutputBytes).toBe(0)
  })
})

function createIdentity() {
  return {
    projectId: 'project-app',
    projectDirectory: '/work/app',
    workspaceName: 'main',
    workspaceDirectory: '/work/app',
    gitBranch: 'main',
    blockId: 'block-1',
    sessionId: 'session-1',
    runId: 'run-1',
    generation: 1
  }
}
