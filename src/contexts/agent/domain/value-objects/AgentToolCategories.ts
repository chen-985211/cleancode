import type { AgentToolName } from './AgentToolName'

export type AgentToolCategory = 'canvas' | 'collaboration'
export type AgentToolCategories = Readonly<Record<AgentToolCategory, boolean>>

export const agentToolCategoryByName = {
  list_agents: 'collaboration',
  list_agent_providers: 'collaboration',
  create_agent: 'collaboration',
  send_agent_message: 'collaboration',
  wait_agent_message: 'collaboration',
  inspect_graph: 'canvas',
  create_block: 'canvas',
  create_terminal: 'canvas',
  create_terminal_workflow: 'canvas',
  create_terminal_set: 'canvas',
  update_block: 'canvas',
  delete_block: 'canvas',
  create_terminal_group: 'canvas',
  move_terminal_workflow_to_group: 'canvas',
  update_terminal_group: 'canvas',
  delete_terminal_group: 'canvas',
  update_terminal_execution_config: 'canvas',
  connect_terminal_blocks: 'canvas',
  disconnect_terminal_blocks: 'canvas',
  inspect_terminal_workflow_plan: 'canvas',
  arrange_terminal_layout: 'canvas'
} as const satisfies Record<AgentToolName, AgentToolCategory>

export function normalizeAgentToolCategories(value: unknown): AgentToolCategories {
  const input =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    canvas: typeof input.canvas === 'boolean' ? input.canvas : true,
    collaboration: typeof input.collaboration === 'boolean' ? input.collaboration : true
  }
}
