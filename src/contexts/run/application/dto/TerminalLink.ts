export interface TerminalLinkIdentity {
  readonly projectId: string
  readonly workspaceName: string
  readonly blockId: string
  readonly sessionId: string
  readonly runId: string
  readonly generation: number
  readonly viewId: string
}

export interface OpenTerminalLinkCommand extends TerminalLinkIdentity {
  readonly rawTarget: string
}

export type TerminalLinkOpenResult =
  | { readonly kind: 'external'; readonly target: string }
  | {
      readonly kind: 'local'
      readonly target: string
      readonly line?: number
      readonly column?: number
    }
