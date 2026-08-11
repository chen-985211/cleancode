import type { CanvasObjectIdentity } from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'

export interface AgentActivityNavigationTarget {
  readonly target: CanvasObjectIdentity
}

export interface AgentActivityNavigationRequest extends AgentActivityNavigationTarget {
  readonly requestId: number
}
