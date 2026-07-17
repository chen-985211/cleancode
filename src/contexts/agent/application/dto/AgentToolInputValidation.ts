import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'
import { agentToolDefinitions, type AgentToolInputByName } from './AgentToolProtocol'
import { findAgentToolJsonSchemaIssue } from './AgentToolJsonSchema'

export type { AgentToolInputByName } from './AgentToolProtocol'

export function parseAgentToolInput<Name extends AgentToolName>(
  toolName: Name,
  input: unknown
): AgentToolInputByName[Name] {
  const definition = agentToolDefinitions.find((tool) => tool.name === toolName)

  if (!definition) {
    throw createExpectedAppError('AGENT_TOOL_UNAVAILABLE', 'Agent tool is unavailable.', {
      toolName
    })
  }

  const issue = findAgentToolJsonSchemaIssue(definition.inputSchema, input)

  if (issue) {
    throw createExpectedAppError('AGENT_TOOL_INPUT_INVALID', 'Agent tool input is invalid.', {
      path: issue.path,
      reason: issue.reason
    })
  }

  return input as AgentToolInputByName[Name]
}
