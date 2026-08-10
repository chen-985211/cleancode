import type { TerminalSnapshot } from '../../contexts/run/application/dto/TerminalModelSnapshot'
import type { TerminalRunIdentity } from '../../contexts/run/application/dto/TerminalRunEvent'
import type {
  SequencedTerminalOutput,
  TerminalViewOutputEvent
} from '../../contexts/run/application/ports/TerminalModelPort'
import type { TerminalDimensions } from './types'
import type { TerminalScrollbackRows } from '../../contexts/run/application/dto/TerminalRuntimeSettings'
import type { TerminalRendererState } from './terminalRendererController'
import type {
  TerminalZoomRasterCoordinator,
  TerminalZoomRasterPriority
} from './terminalZoomRasterCoordinator'
import type { TerminalRasterScale } from './terminalZoomRasterPolicy'

export interface TerminalSurfaceAttachment {
  readonly element: HTMLDivElement
  readonly isResizeSuspended: boolean
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (input: string) => void
  readonly onOpenLink: (target: string) => void
  readonly onOpenSearch: () => void
  readonly onRestoreRequired: () => void
  readonly onSearchResultsChange: (results: TerminalSearchResults) => void
}

export interface TerminalSearchResults {
  readonly resultIndex: number
  readonly resultCount: number
}

export type TerminalSearchDirection = 'incremental' | 'next' | 'previous'

export type TerminalRestoreResult = 'ready' | 'retry'

interface TerminalSurfaceDiagnostics {
  readonly pendingOutputBytes: number
  readonly rendererState: TerminalRendererState
}

export interface TerminalSurfaceRegistryDiagnostics extends TerminalSurfaceDiagnostics {
  readonly surfaceCount: number
  readonly domSurfaceCount: number
  readonly webglSurfaceCount: number
}

export interface TerminalSurfaceRasterTarget {
  getRasterPriority(): TerminalZoomRasterPriority
  getRasterScale(): TerminalRasterScale
  getRasterCost(scale: TerminalRasterScale): number
  onRasterCostChange?(listener: () => void): () => void
  onRasterPriorityChange?(listener: () => void): () => void
  setRasterScale(scale: TerminalRasterScale): void
}

export interface TerminalSurface {
  readonly rasterTarget?: TerminalSurfaceRasterTarget
  attach(attachment: TerminalSurfaceAttachment): void
  detach(element: HTMLDivElement): void
  dispose(): void
  clearSearch(): void
  find(query: string, direction: TerminalSearchDirection): void
  focus(): void
  getDiagnostics(): TerminalSurfaceDiagnostics
  isBracketedPasteMode(): boolean
  restore(snapshot: TerminalSnapshot): Promise<TerminalRestoreResult>
  setScrollbackRows(rows: TerminalScrollbackRows): void
  setResizeSuspended(isResizeSuspended: boolean): void
  write(output: SequencedTerminalOutput): void
}

export interface TerminalSurfaceLease {
  readonly viewId: string
  readonly surface: TerminalSurface
}

type TerminalSurfaceFactory = () => TerminalSurface
type TerminalViewIdFactory = () => string

export class TerminalSurfaceRegistry {
  private readonly views = new Map<
    string,
    {
      readonly identityKey: string
      readonly surface: TerminalSurface
      readonly unregisterRasterTarget: () => void
    }
  >()

  constructor(
    private readonly defaultFactory?: TerminalSurfaceFactory,
    private readonly createViewId: TerminalViewIdFactory = createDefaultViewId,
    private readonly rasterCoordinator?: Pick<TerminalZoomRasterCoordinator, 'register'>
  ) {}

  create(
    identity: TerminalRunIdentity,
    factory: TerminalSurfaceFactory | undefined = this.defaultFactory
  ): TerminalSurfaceLease {
    if (!factory) throw new Error('A terminal surface factory is required for a terminal view.')

    const viewId = this.createUniqueViewId()
    const surface = factory()
    const unregisterRasterTarget = surface.rasterTarget
      ? (this.rasterCoordinator?.register({ id: viewId, ...surface.rasterTarget }) ??
        (() => undefined))
      : () => undefined
    this.views.set(viewId, {
      identityKey: createTerminalSurfaceKey(identity),
      surface,
      unregisterRasterTarget
    })
    return { viewId, surface }
  }

  write(event: TerminalViewOutputEvent): void {
    if (event.sessionId !== event.scope.sessionId) return
    const view = this.views.get(event.viewId)
    if (!view || view.identityKey !== createTerminalSurfaceKey(event.scope)) return
    view.surface.write(event.output)
  }

  release(viewId: string): void {
    const view = this.views.get(viewId)
    if (!view) return
    this.views.delete(viewId)
    view.unregisterRasterTarget()
    view.surface.dispose()
  }

  disposeAll(): void {
    for (const view of this.views.values()) {
      view.unregisterRasterTarget()
      view.surface.dispose()
    }
    this.views.clear()
  }

  setScrollbackRows(rows: TerminalScrollbackRows): void {
    for (const view of this.views.values()) view.surface.setScrollbackRows(rows)
  }

  getDiagnostics(): TerminalSurfaceRegistryDiagnostics {
    let pendingOutputBytes = 0
    let domSurfaceCount = 0
    let webglSurfaceCount = 0
    for (const view of this.views.values()) {
      const diagnostics = view.surface.getDiagnostics()
      pendingOutputBytes += diagnostics.pendingOutputBytes
      if (diagnostics.rendererState === 'webgl') webglSurfaceCount += 1
      else domSurfaceCount += 1
    }
    return {
      surfaceCount: this.views.size,
      pendingOutputBytes,
      rendererState: webglSurfaceCount > 0 ? 'webgl' : 'dom',
      domSurfaceCount,
      webglSurfaceCount
    }
  }

  private createUniqueViewId(): string {
    let viewId = this.createViewId()
    while (this.views.has(viewId)) viewId = this.createViewId()
    return viewId
  }
}

export function createTerminalSurfaceKey(
  identity: Pick<
    TerminalRunIdentity,
    'projectId' | 'workspaceId' | 'blockId' | 'sessionId' | 'runId' | 'generation'
  >
): string {
  return [
    identity.projectId,
    identity.workspaceId,
    identity.blockId,
    identity.sessionId,
    identity.runId,
    identity.generation
  ].join('\0')
}

function createDefaultViewId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `terminal-view-${Date.now()}-${Math.random()}`
}
