import type { TerminalRunIdentity } from '../../contexts/run/application/dto/TerminalRunEvent'
import type { TerminalOutputEvent } from '../../contexts/run/application/ports/TerminalProcessPort'
import type { TerminalDimensions } from './types'

export interface TerminalSurfaceAttachment {
  readonly element: HTMLDivElement
  readonly isResizeSuspended: boolean
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (input: string) => void
}

export interface TerminalSurface {
  attach(attachment: TerminalSurfaceAttachment): void
  detach(element: HTMLDivElement): void
  dispose(): void
  focus(): void
  setResizeSuspended(isResizeSuspended: boolean): void
  write(output: string): void
}

type TerminalSurfaceFactory = () => TerminalSurface

export class TerminalSurfaceRegistry {
  private readonly surfaces = new Map<string, TerminalSurface>()

  constructor(private readonly defaultFactory?: TerminalSurfaceFactory) {}

  acquire(
    identity: TerminalRunIdentity,
    factory: TerminalSurfaceFactory | undefined = this.defaultFactory
  ): TerminalSurface {
    const key = createTerminalSurfaceKey(identity)
    const current = this.surfaces.get(key)

    if (current) {
      return current
    }
    if (!factory) {
      throw new Error('A terminal surface factory is required for a new run identity.')
    }

    const surface = factory()
    this.surfaces.set(key, surface)
    return surface
  }

  write(event: TerminalOutputEvent): void {
    if (event.sessionId !== event.scope.sessionId) {
      return
    }

    this.surfaces.get(createTerminalSurfaceKey(event.scope))?.write(event.data)
  }

  retain(identities: readonly TerminalRunIdentity[]): void {
    const retainedKeys = new Set(identities.map(createTerminalSurfaceKey))

    for (const [key, surface] of this.surfaces) {
      if (retainedKeys.has(key)) {
        continue
      }

      surface.dispose()
      this.surfaces.delete(key)
    }
  }

  disposeAll(): void {
    for (const surface of this.surfaces.values()) {
      surface.dispose()
    }

    this.surfaces.clear()
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
