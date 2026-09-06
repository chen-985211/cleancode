import type { WorkspaceInitializationRepository } from '../../application/ports/WorkspaceInitializationRepository'
import {
  WorkspaceInitialization,
  type WorkspaceInitializationSnapshot
} from '../../domain/aggregates/WorkspaceInitialization'
import {
  normalizeWorkspaceDefaults,
  type WorkspaceDefaults
} from '../../domain/value-objects/WorkspaceDefaults'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { readFile } from 'node:fs/promises'
import { mutateProjectStateFile, writeProjectStateFile } from './ProjectStateFile'

interface InitializationStore {
  readonly version: 2
  readonly defaults: readonly { readonly projectId: string; readonly value: WorkspaceDefaults }[]
  readonly operations: readonly WorkspaceInitializationSnapshot[]
}

export class FileSystemWorkspaceInitializationRepository implements WorkspaceInitializationRepository {
  constructor(private readonly filePath: string) {}
  async getDefaults(projectId: string): Promise<WorkspaceDefaults> {
    return normalizeWorkspaceDefaults(
      (await this.read()).defaults.find((entry) => entry.projectId === projectId)?.value
    )
  }
  async saveDefaults(projectId: string, defaults: WorkspaceDefaults): Promise<void> {
    const value = normalizeWorkspaceDefaults(defaults)
    await this.update((store) => ({
      ...store,
      defaults: [
        ...store.defaults.filter((entry) => entry.projectId !== projectId),
        { projectId, value }
      ]
    }))
  }
  async find(id: string): Promise<WorkspaceInitializationSnapshot | null> {
    return (await this.read()).operations.find((operation) => operation.id === id) ?? null
  }
  async list(
    projectId: string,
    workspaceId?: string
  ): Promise<readonly WorkspaceInitializationSnapshot[]> {
    return (await this.read()).operations.filter(
      (operation) =>
        operation.projectId === projectId &&
        (workspaceId === undefined || operation.workspaceId === workspaceId)
    )
  }
  async save(snapshot: WorkspaceInitializationSnapshot): Promise<void> {
    const validated = WorkspaceInitialization.restore(snapshot).toSnapshot()
    await this.update((store) => {
      const existing = store.operations.find((operation) => operation.id === snapshot.id)
      if (
        existing &&
        (existing.projectId !== snapshot.projectId ||
          (existing.workspaceId !== snapshot.workspaceId &&
            !(
              existing.stage === 'prepared' &&
              existing.worktreeCreated &&
              snapshot.requiresEmptyCanvas &&
              existing.projectDirectory === snapshot.projectDirectory &&
              existing.workspaceDirectory === snapshot.workspaceDirectory &&
              existing.branchName === snapshot.branchName &&
              existing.items.every((item) => item.result === null)
            )) ||
          (existing.stage === 'cancelled' && snapshot.stage !== 'cancelled'))
      ) {
        throw createExpectedAppError(
          'WORKSPACE_INITIALIZATION_SCOPE_STALE',
          'Initialization record is no longer writable.'
        )
      }
      return {
        ...store,
        operations: [
          ...store.operations.filter((operation) => operation.id !== snapshot.id),
          validated
        ]
      }
    })
  }
  private async update(change: (store: InitializationStore) => InitializationStore): Promise<void> {
    await mutateProjectStateFile(this.filePath, async () => {
      await writeProjectStateFile(
        this.filePath,
        `${JSON.stringify(change(await this.read()), null, 2)}\n`
      )
    })
  }
  private async read(): Promise<InitializationStore> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return { version: 2, defaults: [], operations: [] }
      throw error
    }
    try {
      const parsed = JSON.parse(raw) as {
        version: number
        defaults: { projectId: string; value: unknown }[]
        operations: WorkspaceInitializationSnapshot[]
      }
      if (
        (parsed.version !== 1 && parsed.version !== 2) ||
        !Array.isArray(parsed.defaults) ||
        !Array.isArray(parsed.operations) ||
        new Set(parsed.operations.map((item) => item.id)).size !== parsed.operations.length
      )
        throw new Error('Invalid store.')
      return {
        version: 2,
        defaults: parsed.defaults.map((entry) => {
          if (!entry.projectId?.trim()) throw new Error('Invalid project default scope.')
          return {
            projectId: entry.projectId,
            value: normalizeWorkspaceDefaults(
              parsed.version === 1 ? migrateLegacyDefaults(entry.value) : entry.value
            )
          }
        }),
        operations: parsed.operations.map((operation) =>
          WorkspaceInitialization.restore(operation).toSnapshot()
        )
      }
    } catch {
      throw createExpectedAppError(
        'WORKSPACE_INITIALIZATION_INVALID',
        'Persisted workspace initialization is invalid.'
      )
    }
  }
}

function migrateLegacyDefaults(value: unknown): unknown {
  if (
    !value ||
    typeof value !== 'object' ||
    !('templates' in value) ||
    !('providerId' in value) ||
    (value.providerId !== null &&
      (typeof value.providerId !== 'string' || !value.providerId.trim()))
  ) {
    throw new Error('Invalid legacy workspace defaults.')
  }
  return {
    templates: value.templates,
    agents: value.providerId === null ? [] : [{ providerId: value.providerId, count: 1 }]
  }
}
