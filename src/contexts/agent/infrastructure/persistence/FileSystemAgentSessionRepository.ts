import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type { AgentSessionRepository } from '../../application/ports/AgentSessionRepository'
import {
  AgentSession,
  type PersistedAgentSessionSnapshot
} from '../../domain/aggregates/AgentSession'
import type { AgentConversationScope } from '../../domain/value-objects/AgentConversationScope'

interface AgentSessionStore {
  readonly sessions: readonly PersistedAgentSessionSnapshot[]
  readonly version: 1
}

export class FileSystemAgentSessionRepository implements AgentSessionRepository {
  private saveQueue = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async find(scope: AgentConversationScope): Promise<AgentSession | null> {
    const store = await this.readStore()
    const snapshot = store.sessions.find(
      (candidate) => AgentSession.fromSnapshot(candidate).scope.key === scope.key
    )

    return snapshot ? AgentSession.fromSnapshot(snapshot) : null
  }

  async save(session: AgentSession): Promise<void> {
    await this.update((sessions) => {
      const snapshot = session.toSnapshot()
      return [
        ...sessions.filter(
          (candidate) =>
            candidate.scope.projectId !== snapshot.scope.projectId ||
            candidate.scope.workspaceName !== snapshot.scope.workspaceName ||
            candidate.scope.gitBranch !== snapshot.scope.gitBranch
        ),
        snapshot
      ]
    })
  }

  async delete(scope: AgentConversationScope): Promise<void> {
    await this.update((sessions) =>
      sessions.filter((candidate) => AgentSession.fromSnapshot(candidate).scope.key !== scope.key)
    )
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.update((sessions) =>
      sessions.filter((candidate) => candidate.scope.projectId !== projectId)
    )
  }

  private async update(
    updateSessions: (
      sessions: readonly PersistedAgentSessionSnapshot[]
    ) => readonly PersistedAgentSessionSnapshot[]
  ): Promise<void> {
    const update = this.saveQueue
      .catch(() => undefined)
      .then(async () => {
        const store = await this.readStore()
        await writeFileAtomically(
          this.filePath,
          `${JSON.stringify({ sessions: updateSessions(store.sessions), version: 1 }, null, 2)}\n`
        )
      })

    this.saveQueue = update
    await update
  }

  private async readStore(): Promise<AgentSessionStore> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<AgentSessionStore>

      if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
        throw new Error('Persisted Agent session store is invalid.')
      }

      return { sessions: parsed.sessions, version: 1 }
    } catch (error) {
      if (isMissingFileError(error)) {
        return { sessions: [], version: 1 }
      }

      throw error
    }
  }
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
