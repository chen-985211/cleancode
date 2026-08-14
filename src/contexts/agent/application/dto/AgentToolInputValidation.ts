import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { classifyCanvasExecutionStructure } from '../../../../shared-kernel/domain/policies/CanvasExecutionSemantics'
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

  if (toolName === 'create_terminal_workflow') {
    assertTerminalStructure(input as AgentToolInputByName['create_terminal_workflow'], 'workflow')
  }
  if (toolName === 'create_terminal_set') {
    assertTerminalStructure(input as AgentToolInputByName['create_terminal_set'], 'multiple')
  }

  return input as AgentToolInputByName[Name]
}

function assertTerminalStructure(
  input: AgentToolInputByName['create_terminal_workflow'],
  expectedType: 'multiple' | 'workflow'
): void {
  const actualType = classifyCanvasExecutionStructure({
    dependencies: input.connections.map((connection) => ({
      sourceTerminalId: connection.sourceRef,
      targetTerminalId: connection.targetRef
    })),
    terminals: input.terminals.map((terminal) => ({ terminalId: terminal.ref }))
  })
  if (actualType === expectedType) return

  throw createExpectedAppError('AGENT_TOOL_INPUT_INVALID', 'Agent tool input is invalid.', {
    path: '$.connections',
    reason:
      expectedType === 'workflow'
        ? 'Workflow creation requires one dependency-connected graph with at least two terminals.'
        : 'Terminal set creation requires two or more independent top-level execution units.'
  })
}
