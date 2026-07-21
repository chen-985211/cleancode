import { createRequire } from 'node:module'

import type { SerializeAddon as SerializeAddonInstance } from '@xterm/addon-serialize'
import type { Unicode11Addon as Unicode11AddonInstance } from '@xterm/addon-unicode11'
import type {
  ITerminalInitOnlyOptions,
  ITerminalOptions,
  Terminal as HeadlessTerminalInstance
} from '@xterm/headless'

import type {
  TerminalModeSnapshot,
  TerminalModelDiagnosticsSnapshot,
  TerminalSnapshot
} from '../../application/dto/TerminalModelSnapshot'
import type {
  AttachTerminalViewCommand,
  CreateTerminalModelCommand,
  SequencedTerminalOutput,
  TerminalModelPort,
  TerminalViewOutputEvent
} from '../../application/ports/TerminalModelPort'
import {
  defaultTerminalScrollbackRows,
  type TerminalScrollbackRows
} from '../../application/dto/TerminalRuntimeSettings'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import { isSameTerminalRun } from '../../domain/value-objects/TerminalRunScope'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

const nodeRequire = createRequire(import.meta.url)
const { Terminal: HeadlessTerminal } = nodeRequire('@xterm/headless') as {
  readonly Terminal: new (
    options?: ITerminalOptions & ITerminalInitOnlyOptions
  ) => HeadlessTerminalInstance
}
const { SerializeAddon } = nodeRequire('@xterm/addon-serialize') as {
  readonly SerializeAddon: new () => SerializeAddonInstance
}
const { Unicode11Addon } = nodeRequire('@xterm/addon-unicode11') as {
  readonly Unicode11Addon: new () => Unicode11AddonInstance
}

const pendingOutputHighWatermarkBytes = 1024 * 1024
const pendingOutputLowWatermarkBytes = 256 * 1024

export class HeadlessTerminalModelAdapter implements TerminalModelPort {
  private readonly models = new Map<string, ManagedTerminalModel>()
  private lastRestoreDurationMs = 0
  private scrollbackRows: TerminalScrollbackRows = defaultTerminalScrollbackRows

  create(command: CreateTerminalModelCommand): void {
    const key = createModelKey(command.identity)
    this.models.get(key)?.dispose()
    this.models.delete(key)
    this.models.set(key, new ManagedTerminalModel(command, this.scrollbackRows))
  }

  acceptOutput(identity: TerminalRunScope, data: string): SequencedTerminalOutput {
    return this.requireModel(identity).acceptOutput(data)
  }

  async attachView(command: AttachTerminalViewCommand): Promise<TerminalSnapshot> {
    const startedAt = performance.now()
    const snapshot = await this.requireModel(command.identity).attachView(command)
    this.lastRestoreDurationMs = performance.now() - startedAt
    return snapshot
  }

  detachView(identity: TerminalRunScope, viewId: string): Promise<void> {
    return this.requireModel(identity).detachView(viewId)
  }

  flush(identity: TerminalRunScope): Promise<void> {
    return this.requireModel(identity).flush()
  }

  readWorkingDirectory(identity: TerminalRunScope): string {
    return this.requireModel(identity).currentWorkingDirectory
  }

  resize(identity: TerminalRunScope, columns: number, rows: number): void {
    this.requireModel(identity).resize(columns, rows)
  }

  setScrollbackRows(rows: TerminalScrollbackRows): void {
    this.scrollbackRows = rows
    for (const model of this.models.values()) model.setScrollbackRows(rows)
  }

  updateWorkingDirectory(identity: TerminalRunScope, workingDirectory: string): void {
    this.requireModel(identity).updateWorkingDirectory(workingDirectory)
  }

  retire(identity: TerminalRunScope): void {
    const key = createModelKey(identity)
    const model = this.models.get(key)
    if (!model || !isSameTerminalRun(model.identity, identity)) return

    model.dispose()
    this.models.delete(key)
  }

  disposeAll(): void {
    for (const model of this.models.values()) model.dispose()
    this.models.clear()
  }

  getDiagnostics(): TerminalModelDiagnosticsSnapshot {
    let attachedViewCount = 0
    let pendingOutputBytes = 0

    for (const model of this.models.values()) {
      if (model.hasAttachedView) attachedViewCount += 1
      pendingOutputBytes += model.pendingOutputBytes
    }

    return {
      modelCount: this.models.size,
      attachedViewCount,
      pendingOutputBytes,
      lastRestoreDurationMs: this.lastRestoreDurationMs
    }
  }

  private requireModel(identity: TerminalRunScope): ManagedTerminalModel {
    const model = this.models.get(createModelKey(identity))
    if (!model) {
      throw createExpectedAppError('TERMINAL_MODEL_NOT_FOUND', 'Terminal model was not found.')
    }
    if (!isSameTerminalRun(model.identity, identity)) {
      throw createExpectedAppError(
        'TERMINAL_MODEL_IDENTITY_MISMATCH',
        'Terminal model identity no longer matches the current run.'
      )
    }
    return model
  }
}

class ManagedTerminalModel {
  readonly identity: TerminalRunScope
  private readonly terminal: HeadlessTerminalInstance
  private readonly serializeAddon: SerializeAddonInstance
  private readonly onQueryResponse: (response: string) => void
  private readonly onFlowControlChange: (isPaused: boolean) => void
  private readonly flowControlReasons = new Set<'backpressure' | 'view-handoff'>()
  private activeView: AttachTerminalViewCommand | null = null
  private sequence = 0
  private parsedSequence = 0
  private title = ''
  private workingDirectory: string
  private disposed = false
  pendingOutputBytes = 0

  constructor(command: CreateTerminalModelCommand, scrollbackRows: TerminalScrollbackRows) {
    this.identity = command.identity
    this.workingDirectory = command.workingDirectory
    this.onQueryResponse = command.onQueryResponse
    this.onFlowControlChange = command.onFlowControlChange
    this.terminal = new HeadlessTerminal({
      allowProposedApi: true,
      cols: command.columns,
      convertEol: true,
      disableStdin: false,
      rows: command.rows,
      scrollback: scrollbackRows
    })
    this.serializeAddon = new SerializeAddon()
    const unicodeAddon = new Unicode11Addon()
    this.terminal.loadAddon(
      this.serializeAddon as unknown as Parameters<HeadlessTerminalInstance['loadAddon']>[0]
    )
    this.terminal.loadAddon(
      unicodeAddon as unknown as Parameters<HeadlessTerminalInstance['loadAddon']>[0]
    )
    this.terminal.unicode.activeVersion = '11'
    this.terminal.onData((response) => this.onQueryResponse(response))
    this.terminal.onTitleChange((title) => {
      this.title = title
    })
    this.terminal.parser.registerOscHandler(7, (data) => {
      this.workingDirectory = readOscWorkingDirectory(data) ?? this.workingDirectory
      return true
    })
  }

  get hasAttachedView(): boolean {
    return this.activeView !== null
  }

  get currentWorkingDirectory(): string {
    this.assertActive()
    return this.workingDirectory
  }

  acceptOutput(data: string): SequencedTerminalOutput {
    this.assertActive()
    const output = { data, sequence: ++this.sequence }
    const byteLength = Buffer.byteLength(data)
    this.pendingOutputBytes += byteLength
    if (this.pendingOutputBytes >= pendingOutputHighWatermarkBytes) {
      this.setFlowControlReason('backpressure', true)
    }

    this.terminal.write(data, () => {
      if (this.disposed) return
      this.parsedSequence = output.sequence
      this.pendingOutputBytes = Math.max(0, this.pendingOutputBytes - byteLength)
      if (this.pendingOutputBytes <= pendingOutputLowWatermarkBytes) {
        this.setFlowControlReason('backpressure', false)
      }
    })

    if (this.activeView) {
      const event: TerminalViewOutputEvent = {
        viewId: this.activeView.viewId,
        scope: this.identity,
        sessionId: this.identity.sessionId,
        output
      }
      this.activeView.onOutput(event)
    }

    return output
  }

  async attachView(command: AttachTerminalViewCommand): Promise<TerminalSnapshot> {
    this.assertActive()
    this.setFlowControlReason('view-handoff', true)
    try {
      await this.flush()
      this.terminal.options.disableStdin = true
      this.activeView = command
      return this.createSnapshot(command.viewId)
    } finally {
      this.setFlowControlReason('view-handoff', false)
    }
  }

  async detachView(viewId: string): Promise<void> {
    this.assertActive()
    if (this.activeView?.viewId !== viewId) return

    this.setFlowControlReason('view-handoff', true)
    try {
      await this.flush()
      if (this.activeView?.viewId !== viewId) return
      this.activeView = null
      this.terminal.options.disableStdin = false
    } finally {
      this.setFlowControlReason('view-handoff', false)
    }
  }

  flush(): Promise<void> {
    this.assertActive()
    return new Promise((resolve) => this.terminal.write('', resolve))
  }

  resize(columns: number, rows: number): void {
    this.assertActive()
    this.terminal.resize(columns, rows)
  }

  setScrollbackRows(rows: TerminalScrollbackRows): void {
    this.assertActive()
    this.terminal.options.scrollback = rows
  }

  updateWorkingDirectory(workingDirectory: string): void {
    this.assertActive()
    this.workingDirectory = workingDirectory
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.activeView = null
    this.flowControlReasons.clear()
    this.pendingOutputBytes = 0
    this.serializeAddon.dispose()
    this.terminal.dispose()
  }

  private createSnapshot(viewId: string): TerminalSnapshot {
    return {
      identity: this.identity,
      sequence: this.parsedSequence,
      scrollbackRows: this.terminal.options.scrollback ?? defaultTerminalScrollbackRows,
      unicodeVersion: '11',
      restoreMarker: { viewId, sequence: this.parsedSequence },
      content: this.serializeAddon.serialize({
        scrollback: this.terminal.options.scrollback ?? defaultTerminalScrollbackRows
      }),
      transcript: readTranscript(this.terminal),
      dimensions: { columns: this.terminal.cols, rows: this.terminal.rows },
      title: this.title,
      workingDirectory: this.workingDirectory,
      modes: readModes(this.terminal)
    }
  }

  private setFlowControlReason(reason: 'backpressure' | 'view-handoff', isEnabled: boolean): void {
    const wasPaused = this.flowControlReasons.size > 0
    if (isEnabled) this.flowControlReasons.add(reason)
    else this.flowControlReasons.delete(reason)
    const isPaused = this.flowControlReasons.size > 0
    if (wasPaused !== isPaused) this.onFlowControlChange(isPaused)
  }

  private assertActive(): void {
    if (this.disposed) {
      throw createExpectedAppError('TERMINAL_MODEL_NOT_FOUND', 'Terminal model was not found.')
    }
  }
}

function readModes(terminal: HeadlessTerminalInstance): TerminalModeSnapshot {
  return { ...terminal.modes }
}

function readTranscript(terminal: HeadlessTerminalInstance): string {
  const buffer = terminal.buffer.active
  const lines: string[] = []
  for (let index = 0; index < buffer.length; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? '')
  }
  return lines.join('\n').replace(/\n+$/u, '')
}

function readOscWorkingDirectory(data: string): string | null {
  try {
    const location = new URL(data)
    return location.protocol === 'file:' ? decodeURIComponent(location.pathname) : null
  } catch {
    return null
  }
}

function createModelKey(identity: TerminalRunScope): string {
  return [
    identity.projectId,
    identity.projectDirectory,
    identity.workspaceName,
    identity.workspaceDirectory,
    identity.blockId,
    identity.sessionId
  ].join('\0')
}
