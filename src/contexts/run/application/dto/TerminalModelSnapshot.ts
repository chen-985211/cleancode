import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'

type OutputSequence = number
export type TerminalModelIdentity = TerminalRunScope

interface RestoreMarker {
  readonly viewId: string
  readonly sequence: OutputSequence
}

interface TerminalDimensionsSnapshot {
  readonly columns: number
  readonly rows: number
}

export interface TerminalModeSnapshot {
  readonly applicationCursorKeysMode: boolean
  readonly applicationKeypadMode: boolean
  readonly bracketedPasteMode: boolean
  readonly insertMode: boolean
  readonly mouseTrackingMode: 'none' | 'x10' | 'vt200' | 'drag' | 'any'
  readonly originMode: boolean
  readonly reverseWraparoundMode: boolean
  readonly sendFocusMode: boolean
  readonly synchronizedOutputMode: boolean
  readonly wraparoundMode: boolean
}

export interface TerminalSnapshot {
  readonly identity: TerminalModelIdentity
  readonly sequence: OutputSequence
  readonly scrollbackRows: number
  readonly unicodeVersion: '11'
  readonly restoreMarker: RestoreMarker
  readonly content: string
  readonly transcript: string
  readonly dimensions: TerminalDimensionsSnapshot
  readonly title: string
  readonly workingDirectory: string
  readonly modes: TerminalModeSnapshot
}

export interface TerminalModelDiagnosticsSnapshot {
  readonly modelCount: number
  readonly attachedViewCount: number
  readonly pendingOutputBytes: number
  readonly lastRestoreDurationMs: number
}
