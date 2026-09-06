import { WorkspaceInitialization } from '../../domain/aggregates/WorkspaceInitialization'
import type { WorkspaceInitializationSnapshot } from '../../domain/aggregates/WorkspaceInitialization'
import type { WorkspaceInitializationRepository } from '../ports/WorkspaceInitializationRepository'
import type {
  WorkspaceInitializationContentPort,
  WorkspaceInitializationScope
} from '../ports/WorkspaceInitializationContentPort'
import {
  createExpectedAppError,
  getAppErrorCode
} from '../../../../shared-kernel/application/errors/AppError'

export interface InitializeWorkspaceContentCommand {
  readonly initializationId: string
  readonly projectId: string
  readonly workspaceId: string
  readonly positions: readonly { readonly itemId: string; readonly x: number; readonly y: number }[]
  readonly retryItemId?: string
  readonly skipItemId?: string
}

export class InitializeWorkspaceContentUseCase {
  private readonly operations = new Map<string, Promise<unknown>>()
  constructor(
    private readonly repository: WorkspaceInitializationRepository,
    private readonly content: WorkspaceInitializationContentPort,
    private readonly validate: (scope: WorkspaceInitializationScope) => Promise<boolean>
  ) {}

  async execute(
    command: InitializeWorkspaceContentCommand
  ): Promise<WorkspaceInitializationSnapshot> {
    const previous = this.operations.get(command.initializationId) ?? Promise.resolve()
    const operation = previous.catch(() => undefined).then(() => this.apply(command))
    this.operations.set(command.initializationId, operation)
    try {
      return await operation
    } finally {
      if (this.operations.get(command.initializationId) === operation)
        this.operations.delete(command.initializationId)
    }
  }

  private async apply(
    command: InitializeWorkspaceContentCommand
  ): Promise<WorkspaceInitializationSnapshot> {
    const snapshot = await this.repository.find(command.initializationId)
    if (!snapshot)
      throw createExpectedAppError(
        'WORKSPACE_INITIALIZATION_NOT_FOUND',
        'Workspace initialization was not found.'
      )
    if (snapshot.projectId !== command.projectId || snapshot.workspaceId !== command.workspaceId)
      stale()
    const operation = WorkspaceInitialization.restore(snapshot)
    await this.requireScope(operation)
    if (snapshot.stage === 'cancelled') stale()
    operation.interrupt()
    if (command.retryItemId) operation.retry(command.retryItemId)
    if (command.skipItemId) {
      operation.skip(command.skipItemId)
      operation.activate()
      await this.repository.save(operation.toSnapshot())
      return operation.toSnapshot()
    }
    operation.activate()
    const unprepared = operation
      .toSnapshot()
      .items.filter(
        (item) => item.status === 'pending' && item.kind === 'template' && !item.prepared
      )
    if (unprepared.length) {
      for (const item of unprepared) {
        try {
          operation.prepare(item.id, await this.content.prepareTemplate(snapshot, item))
        } catch (error) {
          operation.fail(item.id, getAppErrorCode(error) ?? 'UNEXPECTED_ERROR')
        }
        await this.repository.save(operation.toSnapshot())
      }
      return operation.toSnapshot()
    }
    if ((snapshot.mode === 'empty-canvas' || snapshot.requiresEmptyCanvas) && !snapshot.admitted) {
      if (!(await this.content.isEmpty(snapshot)))
        throw createExpectedAppError(
          'WORKSPACE_INITIALIZATION_CANVAS_NOT_EMPTY',
          'The canvas already contains objects.'
        )
      operation.admit()
    }
    for (const position of command.positions) {
      const item = operation
        .toSnapshot()
        .items.find((candidate) => candidate.id === position.itemId)
      if (!item)
        throw createExpectedAppError(
          'WORKSPACE_INITIALIZATION_INVALID',
          'Unknown initialization item position.'
        )
      if (item.status === 'pending' || item.status === 'failed') operation.place(item.id, position)
    }
    await this.repository.save(operation.toSnapshot())
    for (const original of operation.toSnapshot().items) {
      if (original.status !== 'pending') continue
      await this.requireScope(operation)
      try {
        if (!original.position)
          throw createExpectedAppError(
            'WORKSPACE_INITIALIZATION_INVALID',
            'Initialization placement is required.'
          )
        if (!original.prepared) {
          const name =
            original.kind === 'template'
              ? await this.content.prepareTemplate(snapshot, original)
              : original.name
          operation.prepare(original.id, name)
          await this.repository.save(operation.toSnapshot())
        }
        const item = operation.toSnapshot().items.find((candidate) => candidate.id === original.id)!
        const result =
          item.kind === 'template'
            ? await this.content.createTemplate(snapshot, item)
            : await this.content.createAgent(snapshot, item)
        operation.created(item.id, result)
        await this.repository.save(operation.toSnapshot())
      } catch (error) {
        operation.fail(original.id, getAppErrorCode(error) ?? 'UNEXPECTED_ERROR')
        await this.repository.save(operation.toSnapshot())
      }
    }
    for (const item of operation.toSnapshot().items) {
      if (item.status !== 'created' || item.runStatus !== 'pending' || !item.result) continue
      await this.requireScope(operation)
      operation.requestRun(item.id)
      await this.repository.save(operation.toSnapshot())
      try {
        operation.ran(item.id, await this.content.run(snapshot, item.result))
      } catch (error) {
        const code = getAppErrorCode(error)
        if (code) operation.runFailed(item.id, code)
        else operation.interrupt()
      }
      await this.repository.save(operation.toSnapshot())
    }
    return operation.toSnapshot()
  }

  private async requireScope(operation: WorkspaceInitialization): Promise<void> {
    const snapshot = operation.toSnapshot()
    const persisted = await this.repository.find(snapshot.id)
    if (persisted?.stage === 'cancelled' || !(await this.validate(snapshot))) {
      operation.cancel()
      await this.repository.save(operation.toSnapshot())
      stale()
    }
  }

  async inspect(id: string): Promise<WorkspaceInitializationSnapshot | null> {
    const snapshot = await this.repository.find(id)
    if (!snapshot) return null
    const operation = WorkspaceInitialization.restore(snapshot)
    if (!this.operations.has(id) && snapshot.items.some((item) => item.runStatus === 'requested')) {
      operation.interrupt()
      await this.repository.save(operation.toSnapshot())
    }
    return operation.toSnapshot()
  }
}

function stale(): never {
  throw createExpectedAppError(
    'WORKSPACE_INITIALIZATION_SCOPE_STALE',
    'Workspace initialization target is no longer active.'
  )
}
