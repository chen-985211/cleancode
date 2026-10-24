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

// Workflow membership is derived from the current graph. Persist stable object
// identities, including hidden combination members, rather than a flow ID or z-index.
export type CanvasLayerItemReference = Exclude<CanvasArrangementItemReference, { kind: 'workflow' }>

export interface CanvasArrangementSnapshot {
  readonly projectId: string
  readonly workspaceId: string
  readonly stacks: readonly CanvasStackSnapshot[]
  readonly layerOrder?: readonly CanvasLayerItemReference[]
}
