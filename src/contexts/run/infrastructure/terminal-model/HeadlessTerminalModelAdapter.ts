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
  TerminalModelCheckpoint,
  TerminalModelDiagnosticsSnapshot,
  TerminalSnapshot
} from '../../application/dto/TerminalModelSnapshot'
import type {
  AttachTerminalViewCommand,
  CreateTerminalModelCommand,
  SequencedTerminalOutput,
  TerminalModelRecoveryPort,
  RestoreTerminalModelCommand,
  TerminalViewOutputEvent
} from '../../application/ports/TerminalModelPort'
import { resolveTerminalOwnerRef } from '../../domain/value-objects/TerminalRunScope'
import {
  defaultTerminalScrollbackRows,
  type TerminalScrollbackRows
} from '../../application/dto/TerminalRuntimeSettings'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import { isSameTerminalRun } from '../../domain/value-objects/TerminalRunScope'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'
import { createTerminalOscColorResponse } from './terminalSourcePalette'
import { TerminalParserContinuation } from './TerminalParserContinuation'

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

export class HeadlessTerminalModelAdapter implements TerminalModelRecoveryPort {
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

  captureCheckpoint(identity: TerminalRunScope): Promise<TerminalModelCheckpoint> {
    return this.requireModel(identity).captureCheckpoint()
  }

  async restoreCheckpoint(command: RestoreTerminalModelCommand): Promise<void> {
    const { checkpoint } = command
    const key = createModelKey(checkpoint.identity)
    this.models.get(key)?.dispose()
    this.models.delete(key)
    const model = new ManagedTerminalModel(
      {
        identity: checkpoint.identity,
        columns: checkpoint.dimensions.columns,
        rows: checkpoint.dimensions.rows,
        workingDirectory: checkpoint.workingDirectory,
        terminalSourceTheme: command.terminalSourceTheme,
        onQueryResponse: command.onQueryResponse,
        onFlowControlChange: command.onFlowControlChange,
        onWorkingDirectoryChanged: command.onWorkingDirectoryChanged
      },
      normalizeScrollbackRows(checkpoint.scrollbackRows)
    )
    this.models.set(key, model)
    try {
      await model.restoreCheckpoint(checkpoint)
    } catch (error) {
      model.dispose()
      this.models.delete(key)
      throw error
    }
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
  private readonly parserContinuation = new TerminalParserContinuation()
  private readonly onQueryResponse: (response: string) => void
  private readonly onFlowControlChange: (isPaused: boolean) => void
  private readonly onWorkingDirectoryChanged?: (workingDirectory: string) => void
  private readonly terminalSourceTheme: TerminalSourceTheme
  private readonly flowControlReasons = new Set<'backpressure' | 'view-handoff'>()
  private activeView: AttachTerminalViewCommand | null = null
  private sequence = 0
  private parsedSequence = 0
  private title = ''
  private workingDirectory: string
  private lastObservedWorkingDirectory: string
  private disposed = false
  pendingOutputBytes = 0

  constructor(command: CreateTerminalModelCommand, scrollbackRows: TerminalScrollbackRows) {
    this.identity = command.identity
    this.workingDirectory = command.workingDirectory
    this.lastObservedWorkingDirectory = command.workingDirectory
    this.onQueryResponse = command.onQueryResponse
    this.onFlowControlChange = command.onFlowControlChange
    this.onWorkingDirectoryChanged = command.onWorkingDirectoryChanged
    this.terminalSourceTheme = command.terminalSourceTheme ?? 'dark'
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
      command.onTitleChanged?.(title)
    })
    this.terminal.parser.registerOscHandler(7, (data) => {
      const workingDirectory = readOscWorkingDirectory(data)
      if (workingDirectory) this.observeWorkingDirectory(workingDirectory)
      return true
    })
    this.registerColorQueryHandler(10)
    this.registerColorQueryHandler(11)
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
      this.parserContinuation.accept(data)
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

  async captureCheckpoint(): Promise<TerminalModelCheckpoint> {
    this.assertActive()
    await this.flush()
    return this.createCheckpoint()
  }

  async restoreCheckpoint(checkpoint: TerminalModelCheckpoint): Promise<void> {
    this.assertActive()
    this.sequence = checkpoint.sequence
    this.title = checkpoint.title
    this.workingDirectory = checkpoint.workingDirectory
    await new Promise<void>((resolve) => {
      this.terminal.write(checkpoint.content, () => {
        if (!this.disposed) {
          this.parserContinuation.accept(checkpoint.content)
          this.parsedSequence = checkpoint.sequence
        }
        resolve()
      })
    })
  }

  async attachView(command: AttachTerminalViewCommand): Promise<TerminalSnapshot> {
    this.assertActive()
    this.setFlowControlReason('view-handoff', true)
    try {
      await this.flush()
      const snapshot = this.createSnapshot(command.viewId)
      this.terminal.options.disableStdin = true
      this.activeView = command
      return snapshot
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
    if (workingDirectory === this.workingDirectory) return
    this.workingDirectory = workingDirectory
  }

  private observeWorkingDirectory(workingDirectory: string): void {
    const hasChangedSinceLastObservation =
      workingDirectory !== this.lastObservedWorkingDirectory ||
      workingDirectory !== this.workingDirectory
    this.lastObservedWorkingDirectory = workingDirectory
    this.updateWorkingDirectory(workingDirectory)
    if (hasChangedSinceLastObservation) this.onWorkingDirectoryChanged?.(workingDirectory)
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
    const checkpoint = this.createCheckpoint()
    return {
      identity: checkpoint.identity,
      sequence: checkpoint.sequence,
      scrollbackRows: checkpoint.scrollbackRows,
      unicodeVersion: checkpoint.unicodeVersion,
      restoreMarker: { viewId, sequence: this.parsedSequence },
      content: checkpoint.content,
      transcript: checkpoint.transcript,
      dimensions: checkpoint.dimensions,
      title: checkpoint.title,
      workingDirectory: checkpoint.workingDirectory,
      modes: checkpoint.modes,
      terminalSourceTheme: this.terminalSourceTheme
    }
  }

  private createCheckpoint(): TerminalModelCheckpoint {
    const scrollbackRows = this.terminal.options.scrollback ?? defaultTerminalScrollbackRows
    const continuation = this.parserContinuation.read()
    return {
      schemaVersion: 1,
      identity: this.identity,
      sequence: this.parsedSequence,
      scrollbackRows,
      unicodeVersion: '11',
      content: this.serializeAddon.serialize({ scrollback: scrollbackRows }) + continuation,
      normalContent: this.serializeAddon.serialize({
        excludeAltBuffer: true,
        scrollback: scrollbackRows
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

  private registerColorQueryHandler(code: 10 | 11): void {
    this.terminal.parser.registerOscHandler(code, (data) => {
      if (data !== '?') return false
      this.onQueryResponse(createTerminalOscColorResponse(code, this.terminalSourceTheme))
      return true
    })
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
  const buffer = terminal.buffer.normal
  const lines: string[] = []
  for (let index = 0; index < buffer.length; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? '')
  }
  return lines.join('\n').replace(/\n+$/u, '')
}

function normalizeScrollbackRows(rows: number): TerminalScrollbackRows {
  if (rows === 1000 || rows === 5000 || rows === 10000) return rows
  return defaultTerminalScrollbackRows
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
  const owner = resolveTerminalOwnerRef(identity)
  return [identity.projectId, identity.workspaceId, owner.kind, owner.id, identity.sessionId].join(
    '\0'
  )
}
