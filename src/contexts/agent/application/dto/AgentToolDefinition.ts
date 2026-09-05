import type { AgentToolName } from '../../domain/value-objects/AgentToolName'
import type { AgentToolObjectJsonSchema } from './AgentToolJsonSchema'

export interface AgentToolDefinition {
  readonly annotations: AgentToolAnnotations
  readonly description: string
  readonly inputSchema: AgentToolObjectJsonSchema
  readonly name: AgentToolName
  readonly outputSchema: AgentToolObjectJsonSchema
  readonly requiresApproval: boolean
}

export interface AgentToolAnnotations {
  readonly destructiveHint: boolean
  readonly openWorldHint: boolean
  readonly readOnlyHint: boolean
}
