import type { AgentAuditRepository } from '../../../../src/contexts/agent/application/ports/AgentAuditRepository'
import type { AgentBlockGraphToolPort } from '../../../../src/contexts/agent/application/ports/AgentBlockGraphToolPort'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import {
  ExecuteAgentToolUseCase,
  type AgentToolExecutionResult,
  type ExecuteAgentToolCommand
} from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import type { AgentAuditRecord } from '../../../../src/contexts/agent/domain/entities/AgentAuditRecord'

export class RecordingAgentAuditRepository implements AgentAuditRepository {
  readonly records: AgentAuditRecord[] = []

  async append(record: AgentAuditRecord): Promise<void> {
    this.records.push(record)
  }
}

export function createExecuteTool(
  blockGraphTools: AgentBlockGraphToolPort,
  auditRepository: AgentAuditRepository,
  agentRepository: AgentSessionRepository = createAgentSessionRepository()
): TestExecuteAgentTool {
  const useCase = new ExecuteAgentToolUseCase(blockGraphTools, auditRepository, agentRepository)
  const withDefaultIdentity = (command: TestExecuteAgentToolCommand): ExecuteAgentToolCommand => ({
    ...command,
    agentId: command.agentId ?? 'agent-1',
    projectId: command.projectId ?? 'project-1'
  })

  return {
    cancel: (command, reason) => useCase.cancel(withDefaultIdentity(command), reason),
    execute: (command) => useCase.execute(withDefaultIdentity(command))
  }
}

export function createAgent(
  agentId: string,
  position: { readonly x: number; readonly y: number },
  size: { readonly height: number; readonly width: number }
): AgentSession {
  return AgentSession.create({
    agentId,
    layout: { position, size },
    name: agentId,
    projectId: 'project-1',
    providerId: 'codex',
    workspaceName: 'main'
  })
}

export function createAgentSessionRepository(
  agents: readonly AgentSession[] = []
): AgentSessionRepository & { readonly findWorkspace: ReturnType<typeof vi.fn> } {
  return {
    delete: vi.fn(async () => undefined),
    deleteAgent: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
    find: vi.fn(async () => null),
    findAgent: vi.fn(async () => null),
    findWorkspace: vi.fn(async () => agents),
    save: vi.fn(async () => undefined)
  }
}

type TestExecuteAgentToolCommand = Omit<ExecuteAgentToolCommand, 'agentId' | 'projectId'> &
  Partial<Pick<ExecuteAgentToolCommand, 'agentId' | 'projectId'>>

interface TestExecuteAgentTool {
  cancel(command: TestExecuteAgentToolCommand, reason: string): Promise<AgentToolExecutionResult>
  execute(command: TestExecuteAgentToolCommand): Promise<AgentToolExecutionResult>
}
