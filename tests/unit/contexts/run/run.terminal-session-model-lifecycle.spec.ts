import type { TerminalSnapshot } from '../../../../src/contexts/run/application/dto/TerminalModelSnapshot'
import type {
  AttachTerminalViewCommand,
  CreateTerminalModelCommand,
  SequencedTerminalOutput,
  TerminalModelPort
} from '../../../../src/contexts/run/application/ports/TerminalModelPort'
import type { TerminalProcessPort } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'
import type { TerminalRunScope } from '../../../../src/contexts/run/domain/value-objects/TerminalRunScope'

describe('terminal session model lifecycle', () => {
  it('routes valid PTY output through one authoritative model before application consumers', async () => {
    const processes = new RecordingProcessPort()
    const models = new RecordingModelPort()
    const outputs: Array<{ readonly sequence: number; readonly data: string }> = []
    const service = new TerminalSessionService(processes, undefined, undefined, models)
    const session = await service.start({
      ...startCommand(),
      onOutput: (event) => outputs.push({ sequence: event.sequence, data: event.data })
    })

    processes.emitOutput(session.id, 'first')
    processes.emitOutput(session.id, 'second')

    expect(models.acceptedOutput).toEqual([
      { identity: expect.objectContaining({ sessionId: session.id }), data: 'first' },
      { identity: expect.objectContaining({ sessionId: session.id }), data: 'second' }
    ])
    expect(outputs).toEqual([
      { sequence: 1, data: 'first' },
      { sequence: 2, data: 'second' }
    ])
  })

  it('coordinates view attach, detach, resize and query responses with the exact session identity', async () => {
    const processes = new RecordingProcessPort()
    const models = new RecordingModelPort()
    const service = new TerminalSessionService(processes, undefined, undefined, models)
    const session = await service.start(startCommand())
    const identity = toViewIdentity(session)

    models.creates[0]?.onQueryResponse('\u001b[1;1R')
    models.creates[0]?.onFlowControlChange(true)
    models.creates[0]?.onFlowControlChange(false)
    processes.workingDirectories.set(session.id, '/work/app/src')

    const snapshot = await service.attachView({
      ...identity,
      viewId: 'view-1',
      onOutput: () => undefined
    })
    service.resize(session.id, 120, 36)
    await service.detachView({ ...identity, viewId: 'view-1' })

    expect(processes.writes).toContainEqual({ sessionId: session.id, input: '\u001b[1;1R' })
    expect(processes.flowControl).toEqual([
      { sessionId: session.id, isPaused: true },
      { sessionId: session.id, isPaused: false }
    ])
    expect(models.workingDirectories).toEqual([
      {
        identity: expect.objectContaining({ sessionId: session.id }),
        workingDirectory: '/work/app/src'
      }
    ])
    expect(snapshot.sequence).toBe(0)
    expect(models.resizes).toEqual([
      { identity: expect.objectContaining({ sessionId: session.id }), columns: 120, rows: 36 }
    ])
    expect(models.detaches).toEqual([
      { identity: expect.objectContaining({ sessionId: session.id }), viewId: 'view-1' }
    ])
  })

  it('retires replaced and explicitly terminated models while retaining natural exits', async () => {
    const processes = new RecordingProcessPort()
    const models = new RecordingModelPort()
    const service = new TerminalSessionService(processes, undefined, undefined, models)
    const first = await service.start(startCommand())
    const second = await service.start(startCommand())

    expect(models.retired).toEqual([expect.objectContaining({ sessionId: first.id })])

    processes.emitExit(second.id, 0)
    expect(models.retired).toHaveLength(1)

    await service.terminate(second.id)
    expect(models.retired).toEqual([
      expect.objectContaining({ sessionId: first.id }),
      expect.objectContaining({ sessionId: second.id })
    ])

    await service.stopAll()
    expect(models.disposeAllCalls).toBe(1)
  })

  it('rejects a stale view identity before it can attach to a replacement model', async () => {
    const models = new RecordingModelPort()
    const service = new TerminalSessionService(
      new RecordingProcessPort(),
      undefined,
      undefined,
      models
    )
    const first = await service.start(startCommand())
    await service.start(startCommand())

    await expect(
      service.attachView({ ...toViewIdentity(first), viewId: 'stale', onOutput: () => undefined })
    ).rejects.toMatchObject({ code: 'RUN_SCOPE_STALE' })
    expect(models.attaches).toEqual([])
  })

  it('retires a naturally exited model when a new generation replaces its slot', async () => {
    const processes = new RecordingProcessPort()
    const models = new RecordingModelPort()
    const service = new TerminalSessionService(processes, undefined, undefined, models)
    const first = await service.start(startCommand())
    processes.emitExit(first.id, 0)

    await service.start(startCommand())

    expect(models.retired).toContainEqual(expect.objectContaining({ sessionId: first.id }))
  })
})

class RecordingProcessPort implements TerminalProcessPort {
  readonly starts: Parameters<TerminalProcessPort['start']>[0][] = []
  readonly writes: Array<{ readonly sessionId: string; readonly input: string }> = []
  readonly flowControl: Array<{ readonly sessionId: string; readonly isPaused: boolean }> = []
  readonly workingDirectories = new Map<string, string>()

  async start(command: Parameters<TerminalProcessPort['start']>[0]) {
    this.starts.push(command)
    return { processId: 101 }
  }

  write(sessionId: string, input: string): void {
    this.writes.push({ sessionId, input })
  }

  resize(): void {}

  pauseOutput(sessionId: string): void {
    this.flowControl.push({ sessionId, isPaused: true })
  }

  resumeOutput(sessionId: string): void {
    this.flowControl.push({ sessionId, isPaused: false })
  }

  async readWorkingDirectory(sessionId: string): Promise<string | null> {
    return this.workingDirectories.get(sessionId) ?? null
  }

  async stop(): Promise<void> {}

  async disposeAll(): Promise<void> {}

  emitOutput(sessionId: string, data: string): void {
    const command = this.starts.find((candidate) => candidate.scope.sessionId === sessionId)
    if (!command) throw new Error('Missing terminal process.')
    command.onOutput({ scope: command.scope, sessionId, data })
  }

  emitExit(sessionId: string, exitCode: number): void {
    const command = this.starts.find((candidate) => candidate.scope.sessionId === sessionId)
    if (!command) throw new Error('Missing terminal process.')
    command.onExit({ scope: command.scope, sessionId, exitCode })
  }
}

class RecordingModelPort implements TerminalModelPort {
  readonly creates: CreateTerminalModelCommand[] = []
  readonly acceptedOutput: Array<{ readonly identity: TerminalRunScope; readonly data: string }> =
    []
  readonly attaches: AttachTerminalViewCommand[] = []
  readonly detaches: Array<{ readonly identity: TerminalRunScope; readonly viewId: string }> = []
  readonly resizes: Array<{
    readonly identity: TerminalRunScope
    readonly columns: number
    readonly rows: number
  }> = []
  readonly workingDirectories: Array<{
    readonly identity: TerminalRunScope
    readonly workingDirectory: string
  }> = []
  readonly retired: TerminalRunScope[] = []
  disposeAllCalls = 0
  private sequence = 0

  create(command: CreateTerminalModelCommand): void {
    this.creates.push(command)
  }

  acceptOutput(identity: TerminalRunScope, data: string): SequencedTerminalOutput {
    this.acceptedOutput.push({ identity, data })
    return { data, sequence: ++this.sequence }
  }

  async attachView(command: AttachTerminalViewCommand): Promise<TerminalSnapshot> {
    this.attaches.push(command)
    return createSnapshot(command.identity, this.sequence)
  }

  async detachView(identity: TerminalRunScope, viewId: string): Promise<void> {
    this.detaches.push({ identity, viewId })
  }

  async flush(): Promise<void> {}

  resize(identity: TerminalRunScope, columns: number, rows: number): void {
    this.resizes.push({ identity, columns, rows })
  }

  updateWorkingDirectory(identity: TerminalRunScope, workingDirectory: string): void {
    this.workingDirectories.push({ identity, workingDirectory })
  }

  retire(identity: TerminalRunScope): void {
    this.retired.push(identity)
  }

  disposeAll(): void {
    this.disposeAllCalls += 1
  }

  getDiagnostics() {
    return {
      modelCount: this.creates.length - this.retired.length,
      attachedViewCount: 0,
      pendingOutputBytes: 0,
      lastRestoreDurationMs: 0
    }
  }
}

function startCommand() {
  return {
    projectId: 'project-app',
    projectDirectory: '/work/app',
    terminalBlockId: 'block-1',
    workspaceName: 'main',
    workspaceDirectory: '/work/app',
    gitBranch: 'main',
    workingDirectory: '/work/app',
    shell: '/bin/sh',
    onOutput: () => undefined,
    onExit: () => undefined
  }
}

function toViewIdentity(scope: TerminalRunScope) {
  return {
    projectId: scope.projectId,
    workspaceName: scope.workspaceName,
    blockId: scope.blockId,
    sessionId: scope.sessionId,
    runId: scope.runId,
    generation: scope.generation
  }
}

function createSnapshot(identity: TerminalRunScope, sequence: number): TerminalSnapshot {
  return {
    identity,
    sequence,
    restoreMarker: { viewId: 'view-1', sequence },
    content: '',
    transcript: '',
    dimensions: { columns: 88, rows: 24 },
    title: '',
    workingDirectory: '/work/app',
    modes: {
      applicationCursorKeysMode: false,
      applicationKeypadMode: false,
      bracketedPasteMode: false,
      insertMode: false,
      mouseTrackingMode: 'none',
      originMode: false,
      reverseWraparoundMode: false,
      sendFocusMode: false,
      synchronizedOutputMode: false,
      wraparoundMode: true
    }
  }
}
