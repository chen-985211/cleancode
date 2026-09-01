import type { AgentActivityNavigationTarget } from '../../../contexts/agent/presentation/view-models/AgentActivityNavigationTarget'

export type { AgentActivityNavigationTarget }

export interface AgentActivityNavigationRequest extends AgentActivityNavigationTarget {
  readonly requestId: number
}
