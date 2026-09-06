import { AgentMessageMailbox } from '../../../../src/contexts/agent/application/services/AgentMessageMailbox'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import { ExecuteAgentToolUseCase } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import { AgentCollaborationTools } from '../../../../src/contexts/agent/application/services/AgentCollaborationTools'
import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
import { AgentProviderAvailabilityService } from '../../../../src/contexts/agent/application/services/AgentProviderAvailabilityService'
import { defaultAgentProviderPreferencesRepository } from '../../../../src/contexts/agent/application/ports/AgentProviderPreferencesRepository'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import type { AgentAuditRecord } from '../../../../src/contexts/agent/domain/entities/AgentAuditRecord'
import type { AgentBlockGraphToolPort } from '../../../../src/contexts/agent/application/ports/AgentBlockGraphToolPort'
import type { AgentToolName } from '../../../../src/contexts/agent/domain/value-objects/AgentToolName'
import { agentToolDefinitions } from '../../../../src/contexts/agent/application/dto/AgentToolProtocol'
import { findAgentToolJsonSchemaIssue } from '../../../../src/contexts/agent/application/dto/AgentToolJsonSchema'
import { CleancodeMcpHttpServer } from '../../../../src/contexts/agent/infrastructure/mcp/CleancodeMcpHttpServer'
import {
  RecordingAgentProviderRegistry,
  RecordingAgentTerminalRuntime
} from '../../../fixtures/agentTerminalRuntime'
import { pollUntilState } from '../../../support/e2ePolling'

describe('Native Agent peer messaging through session-scoped MCP', () => {
  it.each([
    ['claude-code', 'codex', false],
    ['codex', 'claude-code', false],
    ['claude-code', 'codex', true],
    ['codex', 'claude-code', true]
  ] as const)(
    'routes a review and correlated reply from %s to %s without terminal writes, native=%s',
    async (from, to, native) => {
      const source = new RecordingAgentProviderRegistry(from, {
        initialPrompt: true,
        nativeMessages: native,
        activityTracking: native
      })
      const target = new RecordingAgentProviderRegistry(to, {
        initialPrompt: true,
        nativeMessages: native,
        activityTracking: native
      })
      const providers = new AgentProviderRegistry([source.contribution, target.contribution])
      const agents = [agent('author', from), agent('reviewer', to)]
      const repository = memoryRepository(agents)
      const audit: AgentAuditRecord[] = []
      const availability = new AgentProviderAvailabilityService(providers)
      const mailbox = new AgentMessageMailbox()
      const collaboration = new AgentCollaborationTools(
        repository,
        providers,
        availability,
        defaultAgentProviderPreferencesRepository,
        mailbox
      )
      const toolExecution = new ExecuteAgentToolUseCase(
        unavailableGraphTools(),
        {
          append: async (record) => {
            audit.push(record)
          }
        },
        repository,
        collaboration
      )
      const terminal = new RecordingAgentTerminalRuntime()
      const server = new CleancodeMcpHttpServer()
      const service = new AgentSessionService(
        terminal,
        server,
        toolExecution,
        repository,
        providers,
        from,
        undefined,
        availability,
        undefined,
        undefined,
        mailbox
      )
      try {
        await service.attach(attach('author', from))
        await service.attach(attach('reviewer', to))
        const author = source.launchCommands[0]!.cleancodeMcp!
        const reviewer = target.launchCommands[0]!.cleancodeMcp!
        const authorWakeup = vi.fn(async () => undefined)
        const reviewerWakeup = vi.fn(async () => undefined)
        if (native) {
          source.launchCommands[0]!.messageDelivery?.({ notify: authorWakeup })
          target.launchCommands[0]!.messageDelivery?.({ notify: reviewerWakeup })
          await Promise.all([initialize(author), initialize(reviewer)])
        }
        const peers = await call(author, 'list_agents', {})
        expect(peers.output).toMatchObject({
          selfAgentId: 'author',
          agents: [
            { agentId: 'author', deliveryStatus: native ? 'ready' : 'pull_only' },
            { agentId: 'reviewer', deliveryStatus: native ? 'ready' : 'pull_only' }
          ]
        })
        const waiting = native
          ? undefined
          : call(reviewer, 'wait_agent_message', { timeoutMs: 1_000 })
        await call(author, 'send_agent_message', {
          messageId: 'review',
          toAgentId: 'reviewer',
          kind: 'task',
          text: 'Review immutable commit abc. Private source excerpt.'
        })
        if (native) {
          expect(reviewerWakeup).toHaveBeenCalledOnce()
          expect(
            (await call(author, 'wait_agent_message', { timeoutMs: 45_000 })).output
          ).toMatchObject({ result: { status: 'empty' } })
          expect(
            mailbox.isWaiting({
              agentId: 'author',
              projectId: 'p',
              workspaceId: 'w',
              sessionId: ''
            })
          ).toBe(false)
        }
        expect((await (waiting ?? call(reviewer, 'wait_agent_message', {}))).output).toMatchObject({
          result: { message: { fromAgentId: 'author', messageId: 'review' } }
        })
        await call(reviewer, 'send_agent_message', {
          messageId: 'result',
          toAgentId: 'author',
          kind: 'result',
          text: 'One finding.',
          replyToMessageId: 'review'
        })
        if (native) expect(authorWakeup).toHaveBeenCalledOnce()
        expect(
          (await call(author, 'wait_agent_message', { replyToMessageId: 'review', timeoutMs: 0 }))
            .output
        ).toMatchObject({ result: { message: { messageId: 'result', fromAgentId: 'reviewer' } } })
        await call(reviewer, 'wait_agent_message', { acknowledgeMessageId: 'review', timeoutMs: 0 })
        if (native) {
          await call(author, 'wait_agent_message', { acknowledgeMessageId: 'result' })
          expect(authorWakeup).toHaveBeenCalledOnce()
          expect(reviewerWakeup).toHaveBeenCalledOnce()
        } else {
          const closingWait = call(reviewer, 'wait_agent_message', { timeoutMs: 30_000 })
          await pollUntilState({
            description: 'reviewer has admitted its final message wait',
            timeoutMs: 2_000,
            observe: () => call(author, 'list_agents', {}),
            accept: (result) =>
              result.output.agents.some(
                (entry: { agentId: string; waitingForMessage: boolean }) =>
                  entry.agentId === 'reviewer' && entry.waitingForMessage
              )
          })
          await service.disposeAll()
          await closingWait
        }
        expect(terminal.writes).toEqual([])
        expect(JSON.stringify(audit)).not.toContain('Private source excerpt')
        expect(audit).toContainEqual(
          expect.objectContaining({ toolName: 'send_agent_message', status: 'completed' })
        )
      } finally {
        await service.disposeAll()
        server.dispose()
      }
    }
  )
})

async function initialize(endpoint: { readonly serverUrl: string; readonly bearerToken: string }) {
  for (const body of [
    {
      id: 'initialize',
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'peer-test', version: '1' }
      }
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' }
  ]) {
    const response = await fetch(endpoint.serverUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.bearerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    expect(response.ok).toBe(true)
    await response.text()
  }
}

function agent(agentId: string, providerId: string) {
  return AgentSession.create({
    agentId,
    providerId,
    name: agentId,
    projectId: 'p',
    workspaceId: 'w',
    layout: { position: { x: 0, y: 0 }, size: { width: 720, height: 460 } }
  })
}

function attach(agentId: string, providerId: string) {
  return {
    agentId,
    providerId,
    projectId: 'p',
    workspaceId: 'w',
    projectDirectory: '/repo',
    workspaceDirectory: '/repo',
    terminalSourceTheme: 'dark' as const,
    persistenceMode: 'ephemeral' as const,
    onGraphUpdated: () => undefined,
    onToolApprovalRequested: () => undefined
  }
}

function memoryRepository(agents: AgentSession[]): AgentSessionRepository {
  return {
    findWorkspace: async (projectId, workspaceId) =>
      agents.filter((entry) => entry.projectId === projectId && entry.workspaceId === workspaceId),
    findAgent: async (projectId, workspaceId, agentId) =>
      agents.find(
        (entry) =>
          entry.projectId === projectId && entry.workspaceId === workspaceId && entry.id === agentId
      ) ?? null,
    find: async () => null,
    save: async () => undefined,
    delete: async () => undefined,
    deleteAgent: async () => undefined,
    deleteProject: async () => undefined
  }
}

async function call(
  endpoint: { readonly serverUrl: string; readonly bearerToken: string },
  name: AgentToolName,
  input: unknown
) {
  const response = await fetch(endpoint.serverUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${endpoint.bearerToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name, arguments: input }
    })
  })
  const result = await response.json()
  expect(response.status).toBe(200)
  expect(result.result.isError).toBe(false)
  const structured = result.result.structuredContent
  expect(
    findAgentToolJsonSchemaIssue(
      agentToolDefinitions.find((tool) => tool.name === name)!.outputSchema,
      structured
    )
  ).toBeNull()
  return structured
}

function unavailableGraphTools(): AgentBlockGraphToolPort {
  const unavailable = async (): Promise<never> => {
    throw new Error('Peer messaging must not access the block graph.')
  }
  return {
    arrangeTerminalLayout: unavailable,
    inspectGraph: unavailable,
    createTerminalBlock: unavailable,
    createTerminalWorkflow: unavailable,
    updateTerminalBlock: unavailable,
    deleteTerminalBlock: unavailable,
    createTerminalGroup: unavailable,
    moveTerminalWorkflowToGroup: unavailable,
    updateTerminalGroup: unavailable,
    deleteTerminalGroup: unavailable,
    updateTerminalExecutionConfig: unavailable,
    connectTerminalBlocks: unavailable,
    disconnectTerminalBlocks: unavailable,
    inspectTerminalWorkflowPlan: unavailable
  }
}
