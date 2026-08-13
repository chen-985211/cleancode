export type CanvasArrangementItemReference =
  | {
      readonly kind: 'terminal'
      readonly terminalId: string
    }
  | {
      readonly kind: 'workflow'
      readonly terminalIds: readonly string[]
    }
  | {
      readonly kind: 'combination'
      readonly terminalGroupId: string
    }
  | {
      readonly kind: 'agent'
      readonly agentId: string
    }

export interface CanvasStackSnapshot {
  readonly id: string
  readonly anchor: { readonly x: number; readonly y: number }
  readonly items: readonly CanvasArrangementItemReference[]
}

export interface CanvasArrangementSnapshot {
  readonly projectId: string
  readonly workspaceId: string
  readonly stacks: readonly CanvasStackSnapshot[]
}
