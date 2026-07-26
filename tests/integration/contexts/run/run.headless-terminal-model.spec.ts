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
    expect(snapshot.unicodeVersion).toBe('11')
    expect(snapshot.restoreMarker).toEqual({ viewId: 'view-1', sequence: 2 })
    expect(snapshot.content).toContain('normal')
    expect(snapshot.content).toContain('\u001b[?1049h')
    expect(snapshot.content).toContain('alternate')
    expect(snapshot.transcript).toContain('normal')
    expect(snapshot.transcript).not.toContain('alternate')
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

  it('answers OSC foreground and background queries from the pinned source theme only while hidden', async () => {
    const queryResponses: string[] = []
    const adapter = new HeadlessTerminalModelAdapter()
    const identity = createIdentity()
    const command = {
      identity,
      columns: 80,
      rows: 24,
      workingDirectory: '/work/app',
      terminalSourceTheme: 'dark' as const,
      onQueryResponse: (response: string) => queryResponses.push(response),
      onFlowControlChange: () => undefined
    }

    adapter.create(command)
    adapter.acceptOutput(identity, '\u001b]10;?\u001b\\\u001b]11;?\u0007')
    await adapter.flush(identity)

    expect(queryResponses).toEqual([
      '\u001b]10;rgb:d6d6/dede/e8e8\u001b\\',
      '\u001b]11;rgb:0000/0000/0000\u001b\\'
    ])

    const snapshot = await adapter.attachView({
      identity,
      viewId: 'view-1',
      onOutput: () => undefined
    })
    adapter.acceptOutput(identity, '\u001b]11;?\u001b\\')
    await adapter.flush(identity)

    expect(snapshot.terminalSourceTheme).toBe('dark')
    expect(queryResponses).toHaveLength(2)

    await adapter.detachView(identity, 'view-1')
    adapter.acceptOutput(identity, '\u001b]11;?\u001b\\')
    await adapter.flush(identity)

    expect(queryResponses.at(-1)).toBe('\u001b]11;rgb:0000/0000/0000\u001b\\')
    expect(queryResponses).toHaveLength(3)
  })

  it('answers light source-theme queries with the canonical light palette', async () => {
    const queryResponses: string[] = []
    const adapter = new HeadlessTerminalModelAdapter()
    const identity = createIdentity()
    adapter.create({
      identity,
      columns: 80,
      rows: 24,
      workingDirectory: '/work/app',
      terminalSourceTheme: 'light',
      onQueryResponse: (response) => queryResponses.push(response),
      onFlowControlChange: () => undefined
    })

    adapter.acceptOutput(identity, '\u001b]10;?\u0007\u001b]11;?\u001b\\')
    await adapter.flush(identity)

    expect(queryResponses).toEqual([
      '\u001b]10;rgb:2424/3131/4242\u001b\\',
      '\u001b]11;rgb:ffff/ffff/ffff\u001b\\'
    ])
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

  it('applies one scrollback budget to current and future models', async () => {
    const adapter = new HeadlessTerminalModelAdapter()
    const firstIdentity = createIdentity()
    adapter.create({
      identity: firstIdentity,
      columns: 20,
      rows: 2,
      workingDirectory: '/work/app',
      onQueryResponse: () => undefined,
      onFlowControlChange: () => undefined
    })
    adapter.setScrollbackRows(5000)

    const firstSnapshot = await adapter.attachView({
      identity: firstIdentity,
      viewId: 'view-first',
      onOutput: () => undefined
    })
    const secondIdentity = { ...firstIdentity, sessionId: 'session-2', runId: 'run-2' }
    adapter.create({
      identity: secondIdentity,
      columns: 20,
      rows: 2,
      workingDirectory: '/work/app',
      onQueryResponse: () => undefined,
      onFlowControlChange: () => undefined
    })
    const secondSnapshot = await adapter.attachView({
      identity: secondIdentity,
      viewId: 'view-second',
      onOutput: () => undefined
    })

    expect(firstSnapshot.scrollbackRows).toBe(5000)
    expect(secondSnapshot.scrollbackRows).toBe(5000)
  })

  it('checkpoints and restores both buffers without losing sequence authority', async () => {
    const original = new HeadlessTerminalModelAdapter()
    const identity = createIdentity()
    original.create({
      identity,
      columns: 40,
      rows: 8,
      workingDirectory: '/work/app',
      onQueryResponse: () => undefined,
      onFlowControlChange: () => undefined
    })
    original.acceptOutput(identity, 'normal history\r\n')
    original.acceptOutput(identity, '\u001b[?2004h\u001b[?1049hfull-screen state')

    const checkpoint = await original.captureCheckpoint(identity)

    expect(checkpoint).toMatchObject({
      schemaVersion: 1,
      sequence: 2,
      transcript: expect.stringContaining('normal history'),
      dimensions: { columns: 40, rows: 8 },
      modes: { bracketedPasteMode: true }
    })
    expect(checkpoint.normalContent).toContain('normal history')
    expect(checkpoint.normalContent).not.toContain('full-screen state')
    expect(checkpoint.content).toContain('full-screen state')

    const restored = new HeadlessTerminalModelAdapter()
    await restored.restoreCheckpoint({
      checkpoint,
      onQueryResponse: () => undefined,
      onFlowControlChange: () => undefined
    })
    const snapshot = await restored.attachView({
      identity,
      viewId: 'restored-view',
      onOutput: () => undefined
    })

    expect(snapshot.sequence).toBe(2)
    expect(snapshot.content).toContain('normal history')
    expect(snapshot.content).toContain('full-screen state')
    expect(restored.acceptOutput(identity, '\r\nafter recovery').sequence).toBe(3)
  })
})

function createIdentity() {
  return {
    projectId: 'project-app',
    projectDirectory: '/work/app',
    workspaceId: 'main',
    workspaceDirectory: '/work/app',
    gitBranch: 'main',
    blockId: 'block-1',
    sessionId: 'session-1',
    runId: 'run-1',
    generation: 1
  }
}
