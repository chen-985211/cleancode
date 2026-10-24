import { TerminalSurfaceRetention } from './terminalSurfaceRetention'
import type { TerminalSnapshot } from '../../application/dto/TerminalModelSnapshot'
import type { TerminalRunIdentity } from '../../application/dto/TerminalRunEvent'
import type {
  SequencedTerminalOutput,
  TerminalViewOutputEvent
} from '../../application/ports/TerminalModelPort'
import type { TerminalScrollbackRows } from '../../application/dto/TerminalRuntimeSettings'
import type { TerminalDimensions } from '../view-models/TerminalPresentationTypes'
import type { TerminalRendererState } from './terminalRendererController'
import type {
  TerminalZoomRasterCoordinator,
  TerminalZoomRasterPriority
} from './terminalZoomRasterCoordinator'
import type { TerminalRasterScale } from './terminalZoomRasterPolicy'
import {
  TerminalWorkloadScheduler,
  type TerminalWorkloadDiagnostics,
  type TerminalWorkloadTarget
} from './terminalWorkloadScheduler'
/*
 * The registry owns a local scheduler only for isolated surfaces and tests. AppShell injects the
 * window-wide scheduler so Terminal and Agent views share one frame budget.
 */

export interface TerminalSurfaceAttachment {
  readonly resume?: boolean
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

export interface TerminalSurfaceRegistryDiagnostics
  extends TerminalSurfaceDiagnostics, TerminalWorkloadDiagnostics {
  readonly surfaceCount: number
  readonly domSurfaceCount: number
  readonly focusedSurfaceCount: number
  readonly hiddenSurfaceCount: number
  readonly visibleSurfaceCount: number
  readonly webglSurfaceCount: number
}

export interface TerminalSurfaceRasterTarget {
  getRasterPriority(): TerminalZoomRasterPriority
  getRasterScale(): TerminalRasterScale
  getRasterCost(scale: TerminalRasterScale): number
  onRasterCostChange?(listener: () => void): () => void
  onRasterPriorityChange?(listener: () => void): () => void
  refreshRasterAlignment?(): void
  setRasterScale(scale: TerminalRasterScale): void
}

export type TerminalSurfaceWorkloadTarget = Omit<TerminalWorkloadTarget, 'id'>

export interface TerminalSurfaceRetentionHandlers {
  readonly onInput: (input: string) => void
  readonly onRestoreRequired: () => void
}

export interface TerminalSurface {
  readonly rasterTarget?: TerminalSurfaceRasterTarget
  readonly workloadTarget?: TerminalSurfaceWorkloadTarget
  attach(attachment: TerminalSurfaceAttachment): void
  detach(element: HTMLDivElement): void
  dispose(): void
  park(): void
  retain?(handlers: TerminalSurfaceRetentionHandlers): boolean
  clearSearch(): void
  find(query: string, direction: TerminalSearchDirection): void
  focus(): void
  getDiagnostics(): TerminalSurfaceDiagnostics
  isBracketedPasteMode(): boolean
  isOutputSettled(): boolean
  onOutputSettled(listener: () => void): () => void
  restore(snapshot: TerminalSnapshot): Promise<TerminalRestoreResult>
  setScrollbackRows(rows: TerminalScrollbackRows): void
  setResizeSuspended(isResizeSuspended: boolean): void
  write(output: SequencedTerminalOutput): void
}

export interface TerminalSurfaceLease {
  readonly viewId: string
  readonly surface: TerminalSurface
  readonly retained?: boolean
}

interface RetainedSurfaceLease {
  readonly surface: TerminalSurface
  readonly viewId?: string
  dispose(): void
  setScrollbackRows(rows: TerminalScrollbackRows): void
}

type TerminalSurfaceFactory = () => TerminalSurface
type TerminalViewIdFactory = () => string

export class TerminalSurfaceRegistry {
  private readonly retentionListeners = new Set<() => void>()
  private readonly retention = new TerminalSurfaceRetention<RetainedSurfaceLease>(() => {
    for (const listener of this.retentionListeners) listener()
  })
  private isDisposed = false
  private readonly views = new Map<
    string,
    {
      readonly identityKey: string
      readonly ownerKey: string
      retentionAllowed: boolean
      readonly surface: TerminalSurface
      readonly unregisterOutputStateObservers: () => void
      readonly unregisterWorkloadTarget: () => void
      readonly unregisterRasterTarget: () => void
    }
  >()
  private readonly outputStateListeners = new Set<() => void>()
  private readonly workloadScheduler: Pick<TerminalWorkloadScheduler, 'getDiagnostics' | 'register'>
  private readonly ownedWorkloadScheduler: TerminalWorkloadScheduler | null

  constructor(
    private readonly defaultFactory?: TerminalSurfaceFactory,
    private readonly createViewId: TerminalViewIdFactory = createDefaultViewId,
    private readonly rasterCoordinator?: Pick<TerminalZoomRasterCoordinator, 'register'>,
    workloadScheduler?: Pick<TerminalWorkloadScheduler, 'getDiagnostics' | 'register'>
  ) {
    this.ownedWorkloadScheduler = workloadScheduler ? null : new TerminalWorkloadScheduler()
    this.workloadScheduler = workloadScheduler ?? this.ownedWorkloadScheduler!
  }

  create(
    identity: TerminalRunIdentity,
    factory: TerminalSurfaceFactory | undefined = this.defaultFactory
  ): TerminalSurfaceLease {
    if (!factory) throw new Error('A terminal surface factory is required for a terminal view.')

    const identityKey = createTerminalSurfaceKey(identity)
    const ownerKey = [identity.projectId, identity.workspaceId, identity.blockId].join('\0')
    const retained = this.retention.take(identityKey, ownerKey)
    if (retained?.viewId && this.views.has(retained.viewId)) {
      return { viewId: retained.viewId, surface: retained.surface, retained: true }
    }
    const viewId = this.createUniqueViewId()
    for (const view of this.views.values()) {
      if (view.ownerKey === ownerKey) view.retentionAllowed = false
    }
    const surface = retained?.surface ?? factory()
    const unregisterRasterTarget = surface.rasterTarget
      ? (this.rasterCoordinator?.register({ id: viewId, ...surface.rasterTarget }) ??
        (() => undefined))
      : () => undefined
    const unregisterWorkloadTarget = surface.workloadTarget
      ? (this.workloadScheduler?.register({ id: viewId, ...surface.workloadTarget }) ??
        (() => undefined))
      : () => undefined
    const unregisterOutputStateObservers = combineUnsubscribers(
      surface.onOutputSettled(() => this.notifyOutputStateChange()),
      surface.rasterTarget?.onRasterPriorityChange?.(() => this.notifyOutputStateChange())
    )
    this.views.set(viewId, {
      identityKey,
      ownerKey,
      retentionAllowed: true,
      surface,
      unregisterOutputStateObservers,
      unregisterWorkloadTarget,
      unregisterRasterTarget
    })
    this.notifyOutputStateChange()
    return { viewId, surface }
  }

  write(event: TerminalViewOutputEvent): void {
    if (event.sessionId !== event.scope.sessionId) return
    const view = this.views.get(event.viewId)
    if (!view || view.identityKey !== createTerminalSurfaceKey(event.scope)) return
    view.surface.write(event.output)
  }

  hasRetained(identity: TerminalRunIdentity): boolean {
    const entry = this.retention.peek(createTerminalSurfaceKey(identity))
    return Boolean(entry?.viewId && this.views.get(entry.viewId)?.retentionAllowed)
  }

  onRetentionChange(listener: () => void): () => void {
    this.retentionListeners.add(listener)
    return () => this.retentionListeners.delete(listener)
  }

  /** Keep the exact attached stream; only eviction hands query ownership back to Run. */
  retain(
    viewId: string,
    handlers: {
      readonly detach: () => Promise<unknown>
      readonly onInput: (input: string) => void
    }
  ): boolean {
    const view = this.views.get(viewId)
    if (!view || !view.retentionAllowed || this.isDisposed) return false
    if (
      !view.surface.retain?.({
        onInput: handlers.onInput,
        onRestoreRequired: () => this.retention.evict(view.identityKey)
      })
    )
      return false
    this.retention.put(view.identityKey, view.ownerKey, {
      surface: view.surface,
      viewId,
      setScrollbackRows: () => undefined, // Still registered in views, so updated there.
      dispose: () => {
        view.retentionAllowed = false
        // Keep draining and responding until the main process acknowledges the handoff.
        void handlers.detach().then(
          () => this.release(viewId),
          () => this.release(viewId)
        )
      }
    })
    this.notifyOutputStateChange()
    return true
  }

  release(viewId: string, options: { readonly retain?: boolean } = {}): void {
    const view = this.views.get(viewId)
    if (!view) return
    this.views.delete(viewId)
    view.unregisterOutputStateObservers()
    view.unregisterWorkloadTarget()
    view.unregisterRasterTarget()
    if (
      options.retain &&
      view.retentionAllowed &&
      !this.isDisposed &&
      view.surface.isOutputSettled()
    ) {
      view.surface.park()
      this.retention.put(view.identityKey, view.ownerKey, {
        surface: view.surface,
        dispose: () => view.surface.dispose(),
        setScrollbackRows: (rows) => view.surface.setScrollbackRows(rows)
      })
    } else view.surface.dispose()
    this.notifyOutputStateChange()
  }

  forget(identity: TerminalRunIdentity): void {
    const identityKey = createTerminalSurfaceKey(identity)
    this.retention.evict(identityKey)
    for (const view of this.views.values()) {
      if (view.identityKey === identityKey) view.retentionAllowed = false
    }
  }

  disposeAll(): void {
    this.isDisposed = true
    this.retention.dispose()
    for (const view of this.views.values()) {
      view.unregisterOutputStateObservers()
      view.unregisterWorkloadTarget()
      view.unregisterRasterTarget()
      view.surface.dispose()
    }
    this.views.clear()
    this.ownedWorkloadScheduler?.dispose()
    this.notifyOutputStateChange()
  }

  waitForOutputSettled(identity: TerminalRunIdentity): Promise<void> {
    const identityKey = createTerminalSurfaceKey(identity)
    if (!this.hasBlockingOutputSurface(identityKey)) return Promise.resolve()

    return new Promise((resolve) => {
      const settle = (): void => {
        if (this.hasBlockingOutputSurface(identityKey)) return
        this.outputStateListeners.delete(settle)
        resolve()
      }
      this.outputStateListeners.add(settle)
      settle()
    })
  }

  setScrollbackRows(rows: TerminalScrollbackRows): void {
    this.retention.setScrollbackRows(rows)
    for (const view of this.views.values()) view.surface.setScrollbackRows(rows)
  }

  getDiagnostics(): TerminalSurfaceRegistryDiagnostics {
    let pendingOutputBytes = 0
    let domSurfaceCount = 0
    let focusedSurfaceCount = 0
    let hiddenSurfaceCount = 0
    let visibleSurfaceCount = 0
    let webglSurfaceCount = 0
    for (const view of this.views.values()) {
      const diagnostics = view.surface.getDiagnostics()
      pendingOutputBytes += diagnostics.pendingOutputBytes
      if (diagnostics.rendererState === 'webgl') webglSurfaceCount += 1
      else domSurfaceCount += 1
      const rasterPriority = view.surface.rasterTarget?.getRasterPriority()
      if (rasterPriority === 'focused') focusedSurfaceCount += 1
      if (rasterPriority === 'visible') visibleSurfaceCount += 1
      if (rasterPriority === 'hidden') hiddenSurfaceCount += 1
    }
    const workloadDiagnostics = this.workloadScheduler.getDiagnostics()
    return {
      surfaceCount: this.views.size,
      pendingOutputBytes,
      rendererState: webglSurfaceCount > 0 ? 'webgl' : 'dom',
      domSurfaceCount,
      focusedSurfaceCount,
      hiddenSurfaceCount,
      visibleSurfaceCount,
      webglSurfaceCount,
      ...workloadDiagnostics
    }
  }

  private createUniqueViewId(): string {
    let viewId = this.createViewId()
    while (this.views.has(viewId)) viewId = this.createViewId()
    return viewId
  }

  private hasBlockingOutputSurface(identityKey: string): boolean {
    for (const view of this.views.values()) {
      if (view.identityKey !== identityKey) continue
      if (view.surface.rasterTarget?.getRasterPriority() === 'hidden') continue
      if (!view.surface.isOutputSettled()) return true
    }
    return false
  }

  private notifyOutputStateChange(): void {
    for (const listener of this.outputStateListeners) listener()
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

function combineUnsubscribers(...unsubscribers: Array<(() => void) | undefined>): () => void {
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe?.()
  }
}
