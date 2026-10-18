import {
  agentToolCategoryByName,
  type AgentToolCategory
} from '../../domain/value-objects/AgentToolCategories'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'

export const agentMcpToolCatalog = (['canvas', 'collaboration'] as const).map(
  (id: AgentToolCategory) => ({
    id,
    tools: (Object.keys(agentToolCategoryByName) as AgentToolName[]).filter(
      (name) => agentToolCategoryByName[name] === id
    )
  })
)
