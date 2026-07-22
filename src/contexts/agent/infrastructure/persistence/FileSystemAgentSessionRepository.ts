import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type { AgentSessionRepository } from '../../application/ports/AgentSessionRepository'
import type { AgentProviderRegistryPort } from '../../application/ports/AgentProviderRegistryPort'
import {
  AgentSession,
  type AgentLayoutSnapshot,
  type PersistedAgentSessionSnapshot
} from '../../domain/aggregates/AgentSession'
import { AgentConversationScope } from '../../domain/value-objects/AgentConversationScope'
import { ProviderSessionRef } from '../../domain/value-objects/ProviderSessionRef'

interface AgentWorkspaceSnapshot {
  readonly agents: readonly PersistedAgentSessionSnapshot[]
  readonly projectId: string
  readonly workspaceName: string
}

interface AgentSessionStore {
  readonly version: 4
  readonly workspaces: readonly AgentWorkspaceSnapshot[]
}

interface Version3AgentConversationBindingSnapshot {
  readonly codexThreadId: string
  readonly gitBranch: string | null
}

interface Version3AgentSessionSnapshot {
  readonly agentId: string
  readonly cleancodeMcpEnabled: boolean
  readonly conversations: readonly Version3AgentConversationBindingSnapshot[]
  readonly layout: AgentLayoutSnapshot
  readonly name: string
  readonly projectId: string
  readonly workspaceName: string
}

interface Version3AgentWorkspaceSnapshot {
  readonly agents: readonly Version3AgentSessionSnapshot[]
  readonly projectId: string
  readonly workspaceName: string
}

interface Version3AgentSessionStore {
  readonly version: 3
  readonly workspaces: readonly Version3AgentWorkspaceSnapshot[]
}

type Version2AgentSessionSnapshot = Omit<Version3AgentSessionSnapshot, 'cleancodeMcpEnabled'>

interface Version2AgentWorkspaceSnapshot {
  readonly agents: readonly Version2AgentSessionSnapshot[]
  readonly projectId: string
  readonly workspaceName: string
}

interface Version2AgentSessionStore {
  readonly version: 2
  readonly workspaces: readonly Version2AgentWorkspaceSnapshot[]
}

interface LegacyAgentSessionSnapshot {
  readonly codexThreadId: string
  readonly scope: {
    readonly gitBranch: string | null
    readonly projectId: string
    readonly workspaceName: string
  }
}

interface LegacyAgentSessionStore {
  readonly sessions: readonly LegacyAgentSessionSnapshot[]
  readonly version: 1
}

export class FileSystemAgentSessionRepository implements AgentSessionRepository {
  private saveQueue = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly providers: AgentProviderRegistryPort
  ) {}

  async find(scope: AgentConversationScope): Promise<AgentSession | null> {
    const scopeSnapshot = scope.toSnapshot()
    const agents = await this.findWorkspace(scopeSnapshot.projectId, scopeSnapshot.workspaceName)
    const agent = agents?.find((candidate) => candidate.id === scopeSnapshot.agentId)

    return agent ? AgentSession.fromSnapshot(agent.toSnapshot(), scope) : null
  }

  async findAgent(
    projectId: string,
    workspaceName: string,
    agentId: string
  ): Promise<AgentSession | null> {
    const agents = await this.findWorkspace(projectId, workspaceName)
    return agents?.find((candidate) => candidate.id === agentId) ?? null
  }

  async findWorkspace(
    projectId: string,
    workspaceName: string
  ): Promise<readonly AgentSession[] | null> {
    const store = await this.readStore()
    const workspace = store.workspaces.find(
      (candidate) => candidate.projectId === projectId && candidate.workspaceName === workspaceName
    )

    return workspace ? workspace.agents.map((snapshot) => this.hydrate(snapshot)) : null
  }

  async save(session: AgentSession): Promise<void> {
    const snapshot = this.validateSnapshot(session.toSnapshot())
    await this.update((workspaces) => {
      const existingWorkspace = findWorkspace(
        workspaces,
        snapshot.projectId,
        snapshot.workspaceName
      )
      const nextWorkspace = {
        agents: replaceAgentSnapshot(existingWorkspace?.agents ?? [], snapshot),
        projectId: snapshot.projectId,
        workspaceName: snapshot.workspaceName
      }

      return replaceWorkspace(workspaces, nextWorkspace)
    })
  }

  async delete(scope: AgentConversationScope): Promise<void> {
    const target = scope.toSnapshot()
    await this.update((workspaces) => {
      const workspace = findWorkspace(workspaces, target.projectId, target.workspaceName)
      if (!workspace) return workspaces
      const agent = workspace.agents.find((candidate) => candidate.agentId === target.agentId)
      if (!agent) return workspaces

      return replaceWorkspace(workspaces, {
        ...workspace,
        agents: replaceAgentSnapshot(workspace.agents, {
          ...agent,
          conversations: agent.conversations.filter(
            (conversation) => branchKey(conversation.gitBranch) !== branchKey(target.gitBranch)
          )
        })
      })
    })
  }

  async deleteAgent(projectId: string, workspaceName: string, agentId: string): Promise<void> {
    await this.update((workspaces) => {
      const workspace = findWorkspace(workspaces, projectId, workspaceName)

      if (!workspace) {
        return workspaces
      }

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
        await this.writeStore({ version: 4, workspaces: updateWorkspaces(store.workspaces) })
      })

    this.saveQueue = update
    await update
  }

  private async readStore(): Promise<AgentSessionStore> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as
        | Partial<AgentSessionStore>
        | Partial<Version3AgentSessionStore>
        | Partial<Version2AgentSessionStore>
        | Partial<LegacyAgentSessionStore>

      if (parsed.version === 4 && 'workspaces' in parsed && Array.isArray(parsed.workspaces)) {
        return { version: 4, workspaces: parsed.workspaces as readonly AgentWorkspaceSnapshot[] }
      }

      if (parsed.version === 3 && 'workspaces' in parsed && Array.isArray(parsed.workspaces)) {
        const migratedStore = this.validateStore(
          migrateVersion3Store(parsed.workspaces as readonly Version3AgentWorkspaceSnapshot[])
        )
        await this.writeStore(migratedStore)
        return migratedStore
      }

      if (parsed.version === 2 && 'workspaces' in parsed && Array.isArray(parsed.workspaces)) {
        const migratedStore = this.validateStore(
          migrateVersion2Store(parsed.workspaces as readonly Version2AgentWorkspaceSnapshot[])
        )
        await this.writeStore(migratedStore)
        return migratedStore
      }

      if (parsed.version === 1 && 'sessions' in parsed && Array.isArray(parsed.sessions)) {
        const migratedStore = this.validateStore(
          migrateLegacyStore(parsed.sessions as readonly LegacyAgentSessionSnapshot[])
        )
        await this.writeStore(migratedStore)
        return migratedStore
      }

      throw new Error('Persisted Agent session store is invalid.')
    } catch (error) {
      if (isMissingFileError(error)) {
        return { version: 4, workspaces: [] }
      }

      throw error
    }
  }

  private async writeStore(store: AgentSessionStore): Promise<void> {
    await writeFileAtomically(this.filePath, `${JSON.stringify(store, null, 2)}\n`)
  }

  private hydrate(snapshot: PersistedAgentSessionSnapshot): AgentSession {
    return AgentSession.fromSnapshot(this.validateSnapshot(snapshot))
  }

  private validateStore(store: AgentSessionStore): AgentSessionStore {
    return {
      version: 4,
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
      conversations: snapshot.conversations.map((conversation) => ({
        ...conversation,
        sessionRef: this.providers
          .parseSessionRef(snapshot.providerId, conversation.sessionRef)
          .toSnapshot()
      }))
    }
  }
}

function migrateLegacyStore(sessions: readonly LegacyAgentSessionSnapshot[]): AgentSessionStore {
  const workspaces = new Map<
    string,
    { agent: AgentSession; projectId: string; workspaceName: string }
  >()

  for (const session of sessions) {
    const key = JSON.stringify([session.scope.projectId, session.scope.workspaceName])
    let workspace = workspaces.get(key)

    if (!workspace) {
      const agent = AgentSession.create({
        agentId: createLegacyAgentId(session.scope.projectId, session.scope.workspaceName),
        layout: { position: { x: 540, y: 120 }, size: { width: 440, height: 520 } },
        name: 'Agent 1',
        projectId: session.scope.projectId,
        providerId: 'codex',
        workspaceName: session.scope.workspaceName
      })
      workspace = {
        agent,
        projectId: session.scope.projectId,
        workspaceName: session.scope.workspaceName
      }
      workspaces.set(key, workspace)
    }

    workspace.agent.bindProviderSession(
      createMigratedScope(workspace.agent.id, session.scope),
      createCodexSessionRef(session.codexThreadId)
    )
  }

  return {
    version: 4,
    workspaces: [...workspaces.values()].map((workspace) => ({
      agents: [workspace.agent.toSnapshot()],
      projectId: workspace.projectId,
      workspaceName: workspace.workspaceName
    }))
  }
}

function migrateVersion2Store(
  workspaces: readonly Version2AgentWorkspaceSnapshot[]
): AgentSessionStore {
  return migrateVersion3Store(
    workspaces.map((workspace) => ({
      ...workspace,
      agents: workspace.agents.map((agent) => ({ ...agent, cleancodeMcpEnabled: true }))
    }))
  )
}

function migrateVersion3Store(
  workspaces: readonly Version3AgentWorkspaceSnapshot[]
): AgentSessionStore {
  return {
    version: 4,
    workspaces: workspaces.map((workspace) => ({
      ...workspace,
      agents: workspace.agents.map((agent) => ({
        ...agent,
        conversations: agent.conversations.map((conversation) => ({
          gitBranch: conversation.gitBranch,
          sessionRef: createCodexSessionRef(conversation.codexThreadId).toSnapshot()
        })),
        providerId: 'codex'
      }))
    }))
  }
}

function createCodexSessionRef(threadId: string): ProviderSessionRef {
  return ProviderSessionRef.create({
    formatVersion: 1,
    kind: 'codex-thread',
    value: threadId
  })
}

function createMigratedScope(
  agentId: string,
  scope: LegacyAgentSessionSnapshot['scope']
): AgentConversationScope {
  return AgentConversationScope.create({ agentId, ...scope })
}

function createLegacyAgentId(projectId: string, workspaceName: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([projectId, workspaceName]))
    .digest('hex')
    .slice(0, 24)
  return `legacy-agent-${digest}`
}

function findWorkspace(
  workspaces: readonly AgentWorkspaceSnapshot[],
  projectId: string,
  workspaceName: string
): AgentWorkspaceSnapshot | undefined {
  return workspaces.find(
    (candidate) => candidate.projectId === projectId && candidate.workspaceName === workspaceName
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
        candidate.workspaceName !== workspace.workspaceName
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

function branchKey(gitBranch: string | null): string {
  return gitBranch?.trim() || '\0no-branch'
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
