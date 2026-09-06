import {
  createExpectedAppError,
  getAppErrorCode,
  type AppErrorCode
} from '../../../../shared-kernel/application/errors/AppError'
import {
  normalizeWorkspaceDefaults,
  type WorkspaceDefaults
} from '../value-objects/WorkspaceDefaults'

export interface WorkspaceContentResult {
  readonly objectIds: readonly string[]
  readonly executionTarget:
    | { readonly type: 'block-set'; readonly blockIds: readonly string[] }
    | { readonly type: 'terminal-group'; readonly terminalGroupId: string }
    | null
}

export interface WorkspaceInitializationItem {
  readonly id: string
  readonly kind: 'template' | 'agent'
  readonly templateId: string | null
  readonly providerId: string | null
  readonly name: string
  readonly prepared: boolean
  readonly position: { readonly x: number; readonly y: number } | null
  readonly status: 'pending' | 'created' | 'failed' | 'skipped'
  readonly runStatus: 'disabled' | 'pending' | 'requested' | 'started' | 'failed' | 'uncertain'
  readonly errorCode: AppErrorCode | null
  readonly result: WorkspaceContentResult | null
  readonly runId: string | null
}

export interface WorkspaceInitializationInput {
  readonly id: string
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly workspaceDirectory: string
  readonly branchName: string | null
  readonly defaults: WorkspaceDefaults
  readonly mode: 'new-workspace' | 'empty-canvas'
}

export interface WorkspaceInitializationSnapshot extends Omit<
  WorkspaceInitializationInput,
  'defaults'
> {
  readonly requiresEmptyCanvas?: boolean
  readonly admitted?: boolean
  readonly worktreeCreated?: boolean
  readonly stage: 'prepared' | 'ready' | 'interrupted' | 'complete' | 'cancelled'
  readonly items: readonly WorkspaceInitializationItem[]
}

export class WorkspaceInitialization {
  private constructor(private snapshot: WorkspaceInitializationSnapshot) {}

  static create(input: WorkspaceInitializationInput): WorkspaceInitialization {
    const defaults = normalizeWorkspaceDefaults(input.defaults)
    const scope = {
      id: input.id,
      projectId: input.projectId,
      projectDirectory: input.projectDirectory,
      workspaceId: input.workspaceId,
      workspaceDirectory: input.workspaceDirectory,
      branchName: input.branchName,
      mode: input.mode
    }
    const items: WorkspaceInitializationItem[] = defaults.templates.map((item, index) => ({
      ...newItem(`${input.id}:template:${index}`),
      kind: 'template',
      templateId: item.templateId,
      providerId: null,
      name: item.templateId,
      runStatus: item.runAfterPlacement ? 'pending' : 'disabled'
    }))
    defaults.agents.forEach((agent, groupIndex) => {
      for (let instanceIndex = 0; instanceIndex < agent.count; instanceIndex += 1) {
        items.push({
          ...newItem(`${input.id}:agent:${groupIndex}:${instanceIndex}`),
          kind: 'agent',
          templateId: null,
          providerId: agent.providerId,
          name: agent.providerId,
          runStatus: 'disabled'
        })
      }
    })
    return WorkspaceInitialization.restore({ ...scope, stage: 'prepared', items })
  }

  static restore(snapshot: WorkspaceInitializationSnapshot): WorkspaceInitialization {
    if (
      !snapshot ||
      ![
        snapshot.id,
        snapshot.projectId,
        snapshot.projectDirectory,
        snapshot.workspaceId,
        snapshot.workspaceDirectory
      ].every((value) => typeof value === 'string' && value.trim()) ||
      (snapshot.branchName !== null && !validText(snapshot.branchName)) ||
      (snapshot.admitted !== undefined && typeof snapshot.admitted !== 'boolean') ||
      (snapshot.worktreeCreated !== undefined && typeof snapshot.worktreeCreated !== 'boolean') ||
      !['new-workspace', 'empty-canvas'].includes(snapshot.mode) ||
      !['prepared', 'ready', 'interrupted', 'complete', 'cancelled'].includes(snapshot.stage) ||
      !Array.isArray(snapshot.items) ||
      new Set(snapshot.items.map((item) => item?.id)).size !== snapshot.items.length
    )
      invalid()
    for (const item of snapshot.items) {
      if (
        !item ||
        !validText(item.id) ||
        typeof item.name !== 'string' ||
        typeof item.prepared !== 'boolean' ||
        !['pending', 'created', 'failed', 'skipped'].includes(item.status) ||
        !['disabled', 'pending', 'requested', 'started', 'failed', 'uncertain'].includes(
          item.runStatus
        ) ||
        (item.kind !== 'template' && item.kind !== 'agent') ||
        (item.kind === 'template'
          ? !validText(item.templateId) || item.providerId !== null
          : !validText(item.providerId) ||
            item.templateId !== null ||
            item.runStatus !== 'disabled') ||
        (item.errorCode !== null &&
          getAppErrorCode({ code: item.errorCode, message: '', isExpected: true }) === null) ||
        (item.runId !== null && !validText(item.runId)) ||
        (item.result !== null && !validResult(item.result)) ||
        (item.status === 'created' && !item.result) ||
        (item.position !== null && !validPosition(item.position))
      )
        invalid()
    }
    return new WorkspaceInitialization(structuredClone(snapshot))
  }

  toSnapshot(): WorkspaceInitializationSnapshot {
    return structuredClone(this.snapshot)
  }

  rebindDiscoveredWorkspace(workspaceId: string): void {
    this.assertActive()
    if (
      !validText(workspaceId) ||
      this.snapshot.stage !== 'prepared' ||
      !this.snapshot.worktreeCreated ||
      this.snapshot.mode !== 'new-workspace' ||
      this.snapshot.items.some((item) => item.result !== null)
    )
      conflict()
    this.snapshot = { ...this.snapshot, workspaceId, requiresEmptyCanvas: true }
  }

  admit(): void {
    this.assertActive()
    this.snapshot = { ...this.snapshot, admitted: true }
  }
  confirmWorktreeCreated(): void {
    this.assertActive()
    this.snapshot = { ...this.snapshot, worktreeCreated: true }
  }

  activate(): void {
    this.assertActive()
    this.snapshot = { ...this.snapshot, stage: 'ready' }
    this.finish()
  }

  prepare(id: string, name: string): void {
    const item = this.item(id)
    this.update(id, {
      prepared: true,
      name,
      ...(item.kind === 'template' && !item.prepared ? { position: null } : {})
    })
  }

  place(id: string, position: { readonly x: number; readonly y: number }): void {
    if (!validPosition(position)) invalid()
    const item = this.item(id)
    if (item.status === 'created' || item.status === 'skipped') conflict()
    this.update(id, { position: { x: position.x, y: position.y } })
  }

  created(id: string, result: WorkspaceContentResult): void {
    if (!validResult(result)) invalid()
    const item = this.item(id)
    if (item.status === 'skipped') conflict()
    if (item.status === 'created') {
      if (JSON.stringify(item.result) !== JSON.stringify(result)) conflict()
      return
    }
    this.update(id, { status: 'created', result: structuredClone(result), errorCode: null })
  }

  requestRun(id: string): void {
    const item = this.item(id)
    if (item.status !== 'created' || item.runStatus !== 'pending') conflict()
    this.update(id, { runStatus: 'requested' })
  }

  ran(id: string, runId: string): void {
    this.update(id, { runStatus: 'started', runId, errorCode: null })
  }
  runFailed(id: string, errorCode: AppErrorCode): void {
    this.update(id, { runStatus: 'failed', errorCode })
  }

  interrupt(): void {
    if (this.snapshot.stage === 'cancelled' || this.snapshot.stage === 'complete') return
    this.snapshot = {
      ...this.snapshot,
      stage: 'interrupted',
      items: this.snapshot.items.map((item) =>
        item.runStatus === 'requested' ? { ...item, runStatus: 'uncertain' } : item
      )
    }
  }

  fail(id: string, errorCode: AppErrorCode): void {
    if (this.item(id).status === 'created') return
    this.update(id, { status: 'failed', errorCode })
  }

  retry(id: string): void {
    if (this.item(id).status !== 'failed') conflict()
    this.update(id, { status: 'pending', errorCode: null, position: null })
  }

  skip(id: string): void {
    const item = this.item(id)
    this.update(
      id,
      item.status === 'created'
        ? { runStatus: 'disabled', errorCode: null }
        : { status: 'skipped', runStatus: 'disabled', errorCode: null }
    )
  }

  cancel(): void {
    this.snapshot = { ...this.snapshot, stage: 'cancelled' }
  }

  private assertActive(): void {
    if (this.snapshot.stage === 'cancelled') conflict()
  }
  private item(id: string): WorkspaceInitializationItem {
    this.assertActive()
    const item = this.snapshot.items.find((candidate) => candidate.id === id)
    if (!item) invalid()
    return item
  }
  private update(id: string, update: Partial<WorkspaceInitializationItem>): void {
    this.item(id)
    this.snapshot = {
      ...this.snapshot,
      items: this.snapshot.items.map((item) => (item.id === id ? { ...item, ...update } : item))
    }
    this.finish()
  }
  private finish(): void {
    if (this.snapshot.stage === 'prepared') return
    if (
      this.snapshot.items.every(
        (item) =>
          item.status === 'skipped' ||
          (item.status === 'created' && ['disabled', 'started', 'failed'].includes(item.runStatus))
      )
    ) {
      this.snapshot = { ...this.snapshot, stage: 'complete' }
    }
  }
}

function newItem(id: string) {
  return {
    id,
    prepared: false,
    position: null,
    status: 'pending' as const,
    errorCode: null,
    result: null,
    runId: null
  }
}
function validPosition(position: { readonly x: number; readonly y: number }): boolean {
  return (
    position !== null &&
    typeof position === 'object' &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
  )
}
function invalid(): never {
  throw createExpectedAppError(
    'WORKSPACE_INITIALIZATION_INVALID',
    'Invalid workspace initialization.'
  )
}
function conflict(): never {
  throw createExpectedAppError(
    'WORKSPACE_INITIALIZATION_CONFLICT',
    'Workspace initialization action conflicts with committed progress.'
  )
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
function validIds(ids: unknown): ids is string[] {
  return (
    Array.isArray(ids) && ids.length > 0 && ids.every(validText) && new Set(ids).size === ids.length
  )
}
function validResult(result: WorkspaceContentResult): boolean {
  if (!result || typeof result !== 'object' || !validIds(result.objectIds)) return false
  const target = result.executionTarget
  if (target === null) return true
  if (!target || typeof target !== 'object') return false
  return target.type === 'block-set'
    ? validIds(target.blockIds) && target.blockIds.every((id) => result.objectIds.includes(id))
    : target.type === 'terminal-group' &&
        validText(target.terminalGroupId) &&
        result.objectIds.includes(target.terminalGroupId)
}
