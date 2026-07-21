import type { TerminalLinkIdentity } from '../dto/TerminalLink'

export interface TerminalLinkContext {
  readonly workingDirectory: string
  readonly workspaceDirectory: string
}

export interface TerminalLinkContextPort {
  getTerminalLinkContext(identity: TerminalLinkIdentity): Promise<TerminalLinkContext>
}

export interface ResolveTerminalLinkPathCommand extends TerminalLinkContext {
  readonly rawPath: string
}

export interface ResolvedTerminalLinkPath {
  readonly canonicalPath: string
  readonly kind: 'file' | 'directory' | 'other'
  readonly relativeSegments: readonly string[]
}

export interface TerminalLinkFileSystemPort {
  resolve(command: ResolveTerminalLinkPathCommand): Promise<ResolvedTerminalLinkPath>
}

export interface TerminalLinkOpenerPort {
  openExternal(address: string): Promise<void>
  openLocal(command: {
    readonly path: string
    readonly line?: number
    readonly column?: number
  }): Promise<void>
}
