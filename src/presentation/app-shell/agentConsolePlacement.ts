import type { AgentLayoutSnapshot } from '../../contexts/agent/domain/aggregates/AgentSession'

const agentConsoleGap = 48

export function resolveNewAgentConsolePosition(layouts: readonly AgentLayoutSnapshot[]): {
  readonly x: number
  readonly y: number
} {
  if (layouts.length === 0) return { x: 540, y: 120 }

  return {
    x:
      Math.max(...layouts.map((layout) => layout.position.x + layout.size.width)) + agentConsoleGap,
    y: Math.min(...layouts.map((layout) => layout.position.y))
  }
}
