import type { CanvasArrangementSnapshot } from '../dto/CanvasArrangementSnapshot'
import type { CanvasArrangement } from '../../domain/aggregates/CanvasArrangement'

export interface CanvasArrangementScope {
  readonly projectId: string
  readonly workspaceId: string
}

interface CanvasArrangementTransactionResult<TResult> {
  readonly result: TResult
  readonly snapshot: CanvasArrangementSnapshot
}

export interface CanvasArrangementRepository {
  findWorkspaceSnapshot(
    projectDirectory: string,
    workspaceId: string
  ): Promise<CanvasArrangementSnapshot | null>
  transactWorkspace<TResult>(
    projectDirectory: string,
    scope: CanvasArrangementScope,
    transaction: (arrangement: CanvasArrangement) => TResult | Promise<TResult>
  ): Promise<CanvasArrangementTransactionResult<TResult>>
}
