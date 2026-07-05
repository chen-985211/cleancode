export interface BlockPositionSnapshot {
  readonly x: number
  readonly y: number
}

export interface TerminalBlockSizeSnapshot {
  readonly width: number
  readonly height: number
}

export interface CanvasViewportSnapshot {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export interface TerminalBlockSnapshot {
  readonly id: string
  readonly type: 'terminal'
  readonly name: string
  readonly description: string
  readonly position: BlockPositionSnapshot
  readonly size: TerminalBlockSizeSnapshot
}

export interface BlockGraphSnapshot {
  readonly id: string
  readonly projectId: string
  readonly workspaceName: string
  readonly viewport: CanvasViewportSnapshot
  readonly blocks: readonly TerminalBlockSnapshot[]
}

type RestorableBlockGraphSnapshot = Omit<BlockGraphSnapshot, 'viewport'> & {
  readonly viewport?: Partial<CanvasViewportSnapshot>
}

export interface CreateDefaultGraphInput {
  readonly id?: string
  readonly projectId: string
  readonly workspaceName: string
}

export interface CreateTerminalBlockInput {
  readonly id?: string
  readonly name: string
  readonly description: string
  readonly position: BlockPositionSnapshot
  readonly size?: Partial<TerminalBlockSizeSnapshot>
}

export interface UpdateTerminalBlockMetadataInput {
  readonly name: string
  readonly description: string
}

export interface ResizeTerminalBlockInput {
  readonly size: Partial<TerminalBlockSizeSnapshot>
}

export const defaultCanvasViewport: CanvasViewportSnapshot = {
  x: 0,
  y: 0,
  zoom: 1
}

export const minimumCanvasZoom = 0.35
export const maximumCanvasZoom = 1.6

export const defaultTerminalBlockSize: TerminalBlockSizeSnapshot = {
  width: 420,
  height: 306
}

export const minimumTerminalBlockSize: TerminalBlockSizeSnapshot = {
  width: 360,
  height: 240
}

export class BlockGraph {
  private constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly workspaceName: string,
    private viewportSnapshot: CanvasViewportSnapshot,
    private blockSnapshots: TerminalBlockSnapshot[]
  ) {}

  static createDefault(input: CreateDefaultGraphInput): BlockGraph {
    return new BlockGraph(
      input.id ?? createGraphId(),
      input.projectId,
      input.workspaceName,
      defaultCanvasViewport,
      []
    )
  }

  static fromSnapshot(snapshot: RestorableBlockGraphSnapshot): BlockGraph {
    return new BlockGraph(
      snapshot.id,
      snapshot.projectId,
      snapshot.workspaceName,
      normalizeCanvasViewport(snapshot.viewport, defaultCanvasViewport),
      [...snapshot.blocks.map(normalizeTerminalBlock)]
    )
  }

  get blocks(): readonly TerminalBlockSnapshot[] {
    return this.blockSnapshots
  }

  get viewport(): CanvasViewportSnapshot {
    return this.viewportSnapshot
  }

  createTerminalBlock(input: CreateTerminalBlockInput): TerminalBlockSnapshot {
    const block: TerminalBlockSnapshot = {
      id: input.id ?? createBlockId(),
      type: 'terminal',
      name: input.name,
      description: input.description,
      position: input.position,
      size: normalizeTerminalBlockSize(input.size)
    }

    this.blockSnapshots = [...this.blockSnapshots, block]

    return block
  }

  moveBlock(blockId: string, position: BlockPositionSnapshot): void {
    this.blockSnapshots = this.blockSnapshots.map((block) =>
      block.id === blockId ? { ...block, position } : block
    )
  }

  updateViewport(viewport: Partial<CanvasViewportSnapshot>): void {
    this.viewportSnapshot = normalizeCanvasViewport(viewport, this.viewportSnapshot)
  }

  resizeTerminalBlock(blockId: string, input: ResizeTerminalBlockInput['size']): void {
    let hasUpdatedBlock = false
    const size = normalizeTerminalBlockSize(input)

    this.blockSnapshots = this.blockSnapshots.map((block) => {
      if (block.id !== blockId) {
        return block
      }

      hasUpdatedBlock = true

      return { ...block, size }
    })

    if (!hasUpdatedBlock) {
      throw new Error('Terminal block was not found.')
    }
  }

  updateTerminalBlockMetadata(blockId: string, input: UpdateTerminalBlockMetadataInput): void {
    const name = input.name.trim()

    if (!name) {
      throw new Error('Terminal block name cannot be empty.')
    }

    let hasUpdatedBlock = false

    this.blockSnapshots = this.blockSnapshots.map((block) => {
      if (block.id !== blockId) {
        return block
      }

      hasUpdatedBlock = true

      return {
        ...block,
        name,
        description: input.description.trim()
      }
    })

    if (!hasUpdatedBlock) {
      throw new Error('Terminal block was not found.')
    }
  }

  deleteBlock(blockId: string): void {
    this.blockSnapshots = this.blockSnapshots.filter((block) => block.id !== blockId)
  }

  toSnapshot(): BlockGraphSnapshot {
    return {
      id: this.id,
      projectId: this.projectId,
      workspaceName: this.workspaceName,
      viewport: this.viewportSnapshot,
      blocks: this.blockSnapshots
    }
  }
}

function createGraphId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `graph-${Date.now()}-${Math.random()}`
}

function createBlockId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random()}`
}

function normalizeCanvasViewport(
  viewport: Partial<CanvasViewportSnapshot> | undefined,
  fallback: CanvasViewportSnapshot
): CanvasViewportSnapshot {
  return {
    x: normalizeViewportCoordinate(viewport?.x, fallback.x),
    y: normalizeViewportCoordinate(viewport?.y, fallback.y),
    zoom: normalizeCanvasZoom(viewport?.zoom, fallback.zoom)
  }
}

function normalizeViewportCoordinate(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return value
}

function normalizeCanvasZoom(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(maximumCanvasZoom, Math.max(minimumCanvasZoom, value))
}

function normalizeTerminalBlock(block: TerminalBlockSnapshot): TerminalBlockSnapshot {
  return {
    ...block,
    size: normalizeTerminalBlockSize(block.size)
  }
}

function normalizeTerminalBlockSize(
  size: Partial<TerminalBlockSizeSnapshot> | undefined
): TerminalBlockSizeSnapshot {
  return {
    width: normalizeSizeValue(
      size?.width,
      minimumTerminalBlockSize.width,
      defaultTerminalBlockSize.width
    ),
    height: normalizeSizeValue(
      size?.height,
      minimumTerminalBlockSize.height,
      defaultTerminalBlockSize.height
    )
  }
}

function normalizeSizeValue(value: number | undefined, minimum: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(minimum, Math.round(value))
}
