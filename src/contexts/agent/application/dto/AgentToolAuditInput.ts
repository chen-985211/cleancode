import type { AgentToolName } from '../../domain/value-objects/AgentToolName'
import { agentCollaborationToolDefinitions } from './AgentCollaborationProtocol'

/** Peer task bodies can contain source code. Audit routing metadata, never conversation content. */
export function agentToolAuditInput(toolName: AgentToolName, input: unknown): unknown {
  if (!agentCollaborationToolDefinitions.some((definition) => definition.name === toolName))
    return input
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {}
  const record = input as Record<string, unknown>
  const metadata: Record<string, string | number> = {}
  for (const key of [
    'agentId',
    'providerId',
    'messageId',
    'toAgentId',
    'replyToMessageId',
    'acknowledgeMessageId',
    'kind'
  ]) {
    if (typeof record[key] === 'string' && record[key].length <= 128) metadata[key] = record[key]
  }
  if (typeof record.timeoutMs === 'number' && Number.isFinite(record.timeoutMs))
    metadata.timeoutMs = record.timeoutMs
  return metadata
}
