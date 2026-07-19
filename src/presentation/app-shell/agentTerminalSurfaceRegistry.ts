import type { AgentPtyOutputEvent } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import { createAgentXtermSurface, type AgentXtermSurface } from './agentTerminalXterm'

export interface AgentTerminalSurfaceOwner {
  readonly agentId: string
  readonly projectId: string
  readonly workspaceName: string
}

interface AgentTerminalSurfaceRecord {
  readonly owner: AgentTerminalSurfaceOwner
  readonly surface: AgentXtermSurface
  sessionId: string | null
}

type AgentTerminalSurfaceFactory = () => AgentXtermSurface

export class AgentTerminalSurfaceRegistry {
  private readonly ownerKeyBySessionId = new Map<string, string>()
  private readonly pendingOutputBySessionId = new Map<string, string[]>()
  private readonly recordsByOwnerKey = new Map<string, AgentTerminalSurfaceRecord>()
  private readonly retiredSessionIds = new Set<string>()

  constructor(
    private readonly defaultFactory: AgentTerminalSurfaceFactory = createAgentXtermSurface
  ) {}

  acquire(
    owner: AgentTerminalSurfaceOwner,
    factory: AgentTerminalSurfaceFactory = this.defaultFactory
  ): AgentXtermSurface {
    const ownerKey = createAgentTerminalSurfaceOwnerKey(owner)
    const current = this.recordsByOwnerKey.get(ownerKey)
    if (current) return current.surface

    const surface = factory()
    this.recordsByOwnerKey.set(ownerKey, { owner, sessionId: null, surface })
    return surface
  }

  bind(owner: AgentTerminalSurfaceOwner, sessionId: string, surface: AgentXtermSurface): string {
    const ownerKey = createAgentTerminalSurfaceOwnerKey(owner)
    const record = this.recordsByOwnerKey.get(ownerKey)
    if (!record || record.surface !== surface) return ''

    if (record.sessionId && record.sessionId !== sessionId) {
      this.ownerKeyBySessionId.delete(record.sessionId)
      this.retiredSessionIds.add(record.sessionId)
    }
    const previousOwnerKey = this.ownerKeyBySessionId.get(sessionId)
    if (previousOwnerKey && previousOwnerKey !== ownerKey) {
      const previousRecord = this.recordsByOwnerKey.get(previousOwnerKey)
      if (previousRecord?.sessionId === sessionId) previousRecord.sessionId = null
    }

    record.sessionId = sessionId
    this.retiredSessionIds.delete(sessionId)
    this.ownerKeyBySessionId.set(sessionId, ownerKey)
    const pendingOutput = this.pendingOutputBySessionId.get(sessionId)?.join('') ?? ''
    this.pendingOutputBySessionId.delete(sessionId)
    return pendingOutput
  }

  isBound(
    owner: AgentTerminalSurfaceOwner,
    sessionId: string,
    surface: AgentXtermSurface
  ): boolean {
    const record = this.recordsByOwnerKey.get(createAgentTerminalSurfaceOwnerKey(owner))
    return record?.surface === surface && record.sessionId === sessionId
  }

  write(event: AgentPtyOutputEvent): void {
    const ownerKey = this.ownerKeyBySessionId.get(event.sessionId)
    const record = ownerKey ? this.recordsByOwnerKey.get(ownerKey) : undefined

    if (record?.sessionId === event.sessionId) {
      if (!event.agentId || event.agentId === record.owner.agentId) {
        record.surface.write(event.data)
      }
      return
    }
    if (this.retiredSessionIds.has(event.sessionId)) return

    const pendingOutput = this.pendingOutputBySessionId.get(event.sessionId) ?? []
    pendingOutput.push(event.data)
    this.pendingOutputBySessionId.set(event.sessionId, pendingOutput)
  }

  release(owner: AgentTerminalSurfaceOwner): void {
    const ownerKey = createAgentTerminalSurfaceOwnerKey(owner)
    const record = this.recordsByOwnerKey.get(ownerKey)
    if (!record) return

    if (record.sessionId) {
      this.ownerKeyBySessionId.delete(record.sessionId)
      this.pendingOutputBySessionId.delete(record.sessionId)
    }
    record.surface.dispose()
    this.recordsByOwnerKey.delete(ownerKey)
  }

  releaseWorkspace(projectId: string, workspaceName: string): void {
    for (const record of [...this.recordsByOwnerKey.values()]) {
      if (record.owner.projectId === projectId && record.owner.workspaceName === workspaceName) {
        this.release(record.owner)
      }
    }
  }

  releaseProject(projectId: string): void {
    for (const record of [...this.recordsByOwnerKey.values()]) {
      if (record.owner.projectId === projectId) this.release(record.owner)
    }
  }

  disposeAll(): void {
    for (const record of this.recordsByOwnerKey.values()) record.surface.dispose()
    this.recordsByOwnerKey.clear()
    this.ownerKeyBySessionId.clear()
    this.pendingOutputBySessionId.clear()
    this.retiredSessionIds.clear()
  }
}

function createAgentTerminalSurfaceOwnerKey(owner: AgentTerminalSurfaceOwner): string {
  return [owner.projectId, owner.workspaceName, owner.agentId].join('\0')
}
