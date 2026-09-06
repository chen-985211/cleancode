import { CleancodeMcpHttpServer } from '../../../../src/contexts/agent/infrastructure/mcp/CleancodeMcpHttpServer'
import { AgentMessageMailbox } from '../../../../src/contexts/agent/application/services/AgentMessageMailbox'

describe('MCP message cancellation', () => {
  it.each(['disconnect', 'notification', 'dispose'] as const)(
    'releases a wait on %s and preserves later delivery',
    async (mode) => {
      const server = new CleancodeMcpHttpServer()
      const mailbox = new AgentMessageMailbox()
      const caller = { agentId: 'codex', projectId: 'p', workspaceId: 'w', sessionId: 's' }
      let entered!: () => void
      const admitted = new Promise<void>((resolve) => {
        entered = resolve
      })
      let canceled!: () => void
      const finished = new Promise<void>((resolve) => {
        canceled = resolve
      })
      const endpoint = await server.registerSession({
        projectDirectory: '/repo',
        sessionId: 's',
        workspaceId: 'w',
        executeTool: async (command) => {
          const waiting = mailbox.wait(caller, { timeoutMs: 30_000 }, command.signal)
          entered()
          const result = await waiting
          canceled()
          return {
            status: 'completed',
            graphChanged: false,
            output: { type: 'agent_message_wait', result },
            toolCallId: command.toolCallId
          }
        }
      })
      const controller = new AbortController()
      const post = (body: unknown, signal?: AbortSignal) =>
        fetch(endpoint.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${endpoint.bearerToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body),
          signal
        })
      try {
        const response = post(
          {
            id: 'waiting',
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name: 'wait_agent_message', arguments: {} }
          },
          controller.signal
        ).catch(() => null)
        await admitted
        if (mode === 'disconnect') controller.abort()
        if (mode === 'dispose') endpoint.dispose()
        if (mode === 'notification')
          await post({
            jsonrpc: '2.0',
            method: 'notifications/cancelled',
            params: { requestId: 'waiting' }
          })
        await finished
        await response
        expect(mailbox.isWaiting(caller)).toBe(false)
        mailbox.send(
          { ...caller, agentId: 'claude' },
          { messageId: 'm', toAgentId: 'codex', kind: 'task', text: 'Review' }
        )
        expect(await mailbox.wait(caller, { timeoutMs: 0 })).toMatchObject({ status: 'message' })
      } finally {
        controller.abort()
        mailbox.closeSession('s')
        server.dispose()
      }
    }
  )
})
