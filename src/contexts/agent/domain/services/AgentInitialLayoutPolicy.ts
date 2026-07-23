import {
  defaultAgentLayoutPosition,
  defaultAgentLayoutSize,
  type AgentLayoutSnapshot
} from '../aggregates/AgentSession'

const agentConsoleGap = 48

export function resolveInitialAgentLayout(
  layouts: readonly AgentLayoutSnapshot[]
): AgentLayoutSnapshot {
  if (layouts.length === 0) {
    return {
      position: { ...defaultAgentLayoutPosition },
      size: { ...defaultAgentLayoutSize }
    }
  }
  return {
    position: {
      x:
        Math.max(...layouts.map((layout) => layout.position.x + layout.size.width)) +
        agentConsoleGap,
      y: Math.min(...layouts.map((layout) => layout.position.y))
    },
    size: { ...defaultAgentLayoutSize }
  }
}
