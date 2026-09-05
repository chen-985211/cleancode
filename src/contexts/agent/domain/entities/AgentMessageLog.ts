import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export interface AgentMessageInput {
  readonly messageId: string
  readonly toAgentId: string
  readonly kind: 'task' | 'question' | 'progress' | 'result'
  readonly text: string
  readonly replyToMessageId?: string
}

export interface AgentMessage extends AgentMessageInput {
  readonly fromAgentId: string
}

/** One workspace's process-local messages. Delivery is repeatable until explicitly acknowledged. */
export class AgentMessageLog {
  private readonly messages = new Map<string, AgentMessage>()
  private readonly acknowledged = new Set<string>()

  append(fromAgentId: string, input: AgentMessageInput): AgentMessage {
    if (
      !input.messageId.trim() ||
      input.messageId.length > 128 ||
      !input.text.trim() ||
      input.text.length > 32_768
    ) {
      throw invalidMessage('Message id or text is empty or exceeds its limit.')
    }
    const previous = this.messages.get(input.messageId)
    if (previous) {
      if (
        previous.fromAgentId !== fromAgentId ||
        previous.toAgentId !== input.toAgentId ||
        previous.kind !== input.kind ||
        previous.text !== input.text ||
        previous.replyToMessageId !== input.replyToMessageId
      ) {
        throw invalidMessage('Message id is already used by another message.')
      }
      return previous
    }
    if (input.replyToMessageId) {
      const original = this.messages.get(input.replyToMessageId)
      if (original?.toAgentId !== fromAgentId || original.fromAgentId !== input.toAgentId) {
        throw invalidMessage('A reply must address the sender of a message received by this Agent.')
      }
    }
    if (this.messages.size >= 4_096)
      throw invalidMessage('Workspace message capacity reached for this application process.')
    const message = Object.freeze({ ...input, fromAgentId })
    this.messages.set(input.messageId, message)
    return message
  }

  acknowledge(agentId: string, messageId: string): void {
    if (this.messages.get(messageId)?.toAgentId !== agentId) {
      throw invalidMessage('Only the recipient can acknowledge a message.')
    }
    this.acknowledged.add(messageId)
  }

  next(agentId: string, replyToMessageId?: string): AgentMessage | undefined {
    if (replyToMessageId && this.messages.get(replyToMessageId)?.fromAgentId !== agentId) {
      throw invalidMessage('Only the sender can wait for replies to a message.')
    }
    return [...this.messages.values()].find(
      (message) =>
        message.toAgentId === agentId &&
        !this.acknowledged.has(message.messageId) &&
        (!replyToMessageId || message.replyToMessageId === replyToMessageId)
    )
  }
}

function invalidMessage(message: string) {
  return createExpectedAppError('AGENT_TOOL_INPUT_INVALID', message)
}
