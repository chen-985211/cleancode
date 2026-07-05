export interface BlockPositionSnapshot {
  readonly x: number
  readonly y: number
}

export interface TerminalBlockSnapshot {
  readonly id: string
  readonly type: 'terminal'
  readonly name: string
  readonly description: string
  readonly position: BlockPositionSnapshot
}

export interface BlockGraphSnapshot {
  readonly id: string
  readonly projectId: string
  readonly workspaceName: string
  readonly blocks: readonly TerminalBlockSnapshot[]
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
}

export interface UpdateTerminalBlockMetadataInput {
  readonly name: string
  readonly description: string
}

export class BlockGraph {
  private constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly workspaceName: string,
    private blockSnapshots: TerminalBlockSnapshot[]
  ) {}

  static createDefault(input: CreateDefaultGraphInput): BlockGraph {
    return new BlockGraph(input.id ?? createGraphId(), input.projectId, input.workspaceName, [])
  }

  static fromSnapshot(snapshot: BlockGraphSnapshot): BlockGraph {
    return new BlockGraph(snapshot.id, snapshot.projectId, snapshot.workspaceName, [
      ...snapshot.blocks
    ])
  }

  get blocks(): readonly TerminalBlockSnapshot[] {
    return this.blockSnapshots
  }

  createTerminalBlock(input: CreateTerminalBlockInput): TerminalBlockSnapshot {
    const block: TerminalBlockSnapshot = {
      id: input.id ?? createBlockId(),
      type: 'terminal',
      name: input.name,
      description: input.description,
      position: input.position
    }

    this.blockSnapshots = [...this.blockSnapshots, block]

    return block
  }

  moveBlock(blockId: string, position: BlockPositionSnapshot): void {
    this.blockSnapshots = this.blockSnapshots.map((block) =>
      block.id === blockId ? { ...block, position } : block
    )
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
