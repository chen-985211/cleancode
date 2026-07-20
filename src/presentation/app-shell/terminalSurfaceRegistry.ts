import type { TerminalSnapshot } from '../../contexts/run/application/dto/TerminalModelSnapshot'
import type { TerminalRunIdentity } from '../../contexts/run/application/dto/TerminalRunEvent'
import type {
  SequencedTerminalOutput,
  TerminalViewOutputEvent
} from '../../contexts/run/application/ports/TerminalModelPort'
import type { TerminalDimensions } from './types'

export interface TerminalSurfaceAttachment {
  readonly element: HTMLDivElement
  readonly isResizeSuspended: boolean
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (input: string) => void
  readonly onRestoreRequired: () => void
}

export type TerminalRestoreResult = 'ready' | 'retry'

interface TerminalSurfaceDiagnostics {
  readonly pendingOutputBytes: number
}

export interface TerminalSurfaceRegistryDiagnostics extends TerminalSurfaceDiagnostics {
  readonly surfaceCount: number
}

export interface TerminalSurface {
  attach(attachment: TerminalSurfaceAttachment): void
  detach(element: HTMLDivElement): void
  dispose(): void
  focus(): void
  getDiagnostics(): TerminalSurfaceDiagnostics
  restore(snapshot: TerminalSnapshot): Promise<TerminalRestoreResult>
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
    { readonly identityKey: string; readonly surface: TerminalSurface }
  >()

  constructor(
    private readonly defaultFactory?: TerminalSurfaceFactory,
    private readonly createViewId: TerminalViewIdFactory = createDefaultViewId
  ) {}

  create(
    identity: TerminalRunIdentity,
    factory: TerminalSurfaceFactory | undefined = this.defaultFactory
  ): TerminalSurfaceLease {
    if (!factory) throw new Error('A terminal surface factory is required for a terminal view.')

    const viewId = this.createUniqueViewId()
    const surface = factory()
    this.views.set(viewId, { identityKey: createTerminalSurfaceKey(identity), surface })
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
    view.surface.dispose()
  }

  disposeAll(): void {
    for (const view of this.views.values()) view.surface.dispose()
    this.views.clear()
  }

  getDiagnostics(): TerminalSurfaceRegistryDiagnostics {
    let pendingOutputBytes = 0
    for (const view of this.views.values()) {
      pendingOutputBytes += view.surface.getDiagnostics().pendingOutputBytes
    }
    return { surfaceCount: this.views.size, pendingOutputBytes }
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
    'projectId' | 'workspaceName' | 'blockId' | 'sessionId' | 'runId' | 'generation'
  >
): string {
  return [
    identity.projectId,
    identity.workspaceName,
    identity.blockId,
    identity.sessionId,
    identity.runId,
    identity.generation
  ].join('\0')
}

function createDefaultViewId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `terminal-view-${Date.now()}-${Math.random()}`
}
