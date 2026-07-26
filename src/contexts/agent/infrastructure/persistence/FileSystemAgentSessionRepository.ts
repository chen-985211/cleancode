import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type { AgentSessionRepository } from '../../application/ports/AgentSessionRepository'
import type {
  AgentWorkspaceInitializer,
  InitializeAgentWorkspaceCommand
} from '../../application/ports/AgentWorkspaceInitializer'
import type { AgentProviderRegistryPort } from '../../application/ports/AgentProviderRegistryPort'
import {
  AgentSession,
  type PersistedAgentSessionSnapshot
} from '../../domain/aggregates/AgentSession'
import type { AgentConversationScope } from '../../domain/value-objects/AgentConversationScope'

interface AgentWorkspaceSnapshot {
  readonly agents: readonly PersistedAgentSessionSnapshot[]
  readonly projectId: string
  readonly workspaceId: string
}

interface AgentSessionStore {
  readonly version: 5
  readonly workspaces: readonly AgentWorkspaceSnapshot[]
}

export class FileSystemAgentSessionRepository
  implements AgentSessionRepository, AgentWorkspaceInitializer
{
  private saveQueue = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly providers: AgentProviderRegistryPort
  ) {}

  async find(scope: AgentConversationScope): Promise<AgentSession | null> {
    const target = scope.toSnapshot()
    const agents = await this.findWorkspace(target.projectId, target.workspaceId)
    const agent = agents?.find((candidate) => candidate.id === target.agentId)

    return agent ? AgentSession.fromSnapshot(agent.toSnapshot(), scope) : null
  }

  async findAgent(
    projectId: string,
    workspaceId: string,
    agentId: string
  ): Promise<AgentSession | null> {
    const agents = await this.findWorkspace(projectId, workspaceId)
    return agents?.find((candidate) => candidate.id === agentId) ?? null
  }

  async findWorkspace(
    projectId: string,
    workspaceId: string
  ): Promise<readonly AgentSession[] | null> {
    const store = await this.readStore()
    const workspace = findWorkspace(store.workspaces, projectId, workspaceId)

    return workspace ? workspace.agents.map((snapshot) => this.hydrate(snapshot)) : null
  }

  async save(session: AgentSession): Promise<void> {
    const snapshot = this.validateSnapshot(session.toSnapshot())
    await this.update((workspaces) => {
      const existing = findWorkspace(workspaces, snapshot.projectId, snapshot.workspaceId)
      return replaceWorkspace(workspaces, {
        agents: replaceAgentSnapshot(existing?.agents ?? [], snapshot),
        projectId: snapshot.projectId,
        workspaceId: snapshot.workspaceId
      })
    })
  }

  async initializeWorkspace(
    command: InitializeAgentWorkspaceCommand
  ): Promise<readonly AgentSession[]> {
    const initialSnapshots = command.agents.map((agent) => {
      const snapshot = this.validateSnapshot(agent.toSnapshot())
      if (
        snapshot.projectId !== command.projectId ||
        snapshot.workspaceId !== command.workspaceId
      ) {
        throw new Error('Initial Agent does not belong to the target workspace.')
      }
      return snapshot
    })
    let resolvedSnapshots: readonly PersistedAgentSessionSnapshot[] = initialSnapshots

    await this.update((workspaces) => {
      const existing = findWorkspace(workspaces, command.projectId, command.workspaceId)
      if (existing) {
        resolvedSnapshots = existing.agents
        return workspaces
      }

      return replaceWorkspace(workspaces, {
        agents: initialSnapshots,
        projectId: command.projectId,
        workspaceId: command.workspaceId
      })
    })

    return resolvedSnapshots.map((snapshot) => this.hydrate(snapshot))
  }

  async delete(scope: AgentConversationScope): Promise<void> {
    const target = scope.toSnapshot()
    await this.update((workspaces) => {
      const workspace = findWorkspace(workspaces, target.projectId, target.workspaceId)
      if (!workspace) return workspaces
      const agent = workspace.agents.find((candidate) => candidate.agentId === target.agentId)
      if (!agent) return workspaces

      return replaceWorkspace(workspaces, {
        ...workspace,
        agents: replaceAgentSnapshot(workspace.agents, {
          ...agent,
          providerSessionRef: null
        })
      })
    })
  }

  async deleteAgent(projectId: string, workspaceId: string, agentId: string): Promise<void> {
    await this.update((workspaces) => {
      const workspace = findWorkspace(workspaces, projectId, workspaceId)
      if (!workspace) return workspaces

      return replaceWorkspace(workspaces, {
        ...workspace,
        agents: workspace.agents.filter((candidate) => candidate.agentId !== agentId)
      })
    })
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.update((workspaces) =>
      workspaces.filter((candidate) => candidate.projectId !== projectId)
    )
  }

  private async update(
    updateWorkspaces: (
      workspaces: readonly AgentWorkspaceSnapshot[]
    ) => readonly AgentWorkspaceSnapshot[]
  ): Promise<void> {
    const update = this.saveQueue
      .catch(() => undefined)
      .then(async () => {
        const store = await this.readStore()
        await this.writeStore({ version: 5, workspaces: updateWorkspaces(store.workspaces) })
      })

    this.saveQueue = update
    await update
  }

  private async readStore(): Promise<AgentSessionStore> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<AgentSessionStore>

      if (parsed.version !== 5 || !Array.isArray(parsed.workspaces)) {
        throw new Error('Persisted Agent session store is invalid.')
      }

      return this.validateStore({
        version: 5,
        workspaces: parsed.workspaces as readonly AgentWorkspaceSnapshot[]
      })
    } catch (error) {
      if (isMissingFileError(error)) {
        return { version: 5, workspaces: [] }
      }

      throw error
    }
  }

  private writeStore(store: AgentSessionStore): Promise<void> {
    return writeFileAtomically(this.filePath, `${JSON.stringify(store, null, 2)}\n`)
  }

  private hydrate(snapshot: PersistedAgentSessionSnapshot): AgentSession {
    return AgentSession.fromSnapshot(this.validateSnapshot(snapshot))
  }

  private validateStore(store: AgentSessionStore): AgentSessionStore {
    return {
      version: 5,
      workspaces: store.workspaces.map((workspace) => ({
        ...workspace,
        agents: workspace.agents.map((agent) => this.validateSnapshot(agent))
      }))
    }
  }

  private validateSnapshot(snapshot: PersistedAgentSessionSnapshot): PersistedAgentSessionSnapshot {
    this.providers.require(snapshot.providerId)
    return {
      ...snapshot,
      providerSessionRef: snapshot.providerSessionRef
        ? this.providers
            .parseSessionRef(snapshot.providerId, snapshot.providerSessionRef)
            .toSnapshot()
        : null
    }
  }
}

function findWorkspace(
  workspaces: readonly AgentWorkspaceSnapshot[],
  projectId: string,
  workspaceId: string
): AgentWorkspaceSnapshot | undefined {
  return workspaces.find(
    (candidate) => candidate.projectId === projectId && candidate.workspaceId === workspaceId
  )
}

function replaceWorkspace(
  workspaces: readonly AgentWorkspaceSnapshot[],
  workspace: AgentWorkspaceSnapshot
): readonly AgentWorkspaceSnapshot[] {
  return [
    ...workspaces.filter(
      (candidate) =>
        candidate.projectId !== workspace.projectId ||
        candidate.workspaceId !== workspace.workspaceId
    ),
    workspace
  ]
}

function replaceAgentSnapshot(
  agents: readonly PersistedAgentSessionSnapshot[],
  snapshot: PersistedAgentSessionSnapshot
): readonly PersistedAgentSessionSnapshot[] {
  return agents.some((candidate) => candidate.agentId === snapshot.agentId)
    ? agents.map((candidate) => (candidate.agentId === snapshot.agentId ? snapshot : candidate))
    : [...agents, snapshot]
}

async function writeFileAtomically(filePath: string, contents: string): Promise<void> {
  const directory = dirname(filePath)
  const temporaryPath = join(directory, `.${basename(filePath)}.tmp-${process.pid}-${randomUUID()}`)
  let temporaryFile: FileHandle | null = null

  await mkdir(directory, { recursive: true })

  try {
    temporaryFile = await open(temporaryPath, 'wx')
    await temporaryFile.writeFile(contents)
    await temporaryFile.sync()
    await temporaryFile.close()
    temporaryFile = null
    await rename(temporaryPath, filePath)
  } catch (error) {
    await temporaryFile?.close().catch(() => undefined)
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}
