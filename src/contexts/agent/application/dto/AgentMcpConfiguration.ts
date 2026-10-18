import {
  agentToolCategoryByName,
  normalizeAgentToolCategories,
  type AgentToolCategories
} from '../../domain/value-objects/AgentToolCategories'
import { agentToolDefinitions, createCleancodeMcpInstructions } from './AgentToolProtocol'

export function createAgentMcpConfiguration(categories?: AgentToolCategories) {
  const toolCategories = normalizeAgentToolCategories(categories)
  return {
    toolCategories,
    tools: agentToolDefinitions.filter(
      (tool) => toolCategories[agentToolCategoryByName[tool.name]]
    ),
    instructions: createCleancodeMcpInstructions(toolCategories),
    developerInstructions: createCleancodeMcpInstructions(toolCategories, true)
  }
}

export type AgentMcpConfiguration = ReturnType<typeof createAgentMcpConfiguration>
