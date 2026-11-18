import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface FindDefaultGraphSnapshotQuery {
  readonly projectDirectory: string
  readonly workspaceId: string
}

/** Reads committed state without initializing a missing graph. */
export class FindDefaultGraphSnapshotUseCase {
  constructor(private readonly graphs: BlockGraphRepository) {}

  execute(query: FindDefaultGraphSnapshotQuery): Promise<BlockGraphSnapshot | null> {
    return this.graphs.findDefaultGraphSnapshot(query.projectDirectory, query.workspaceId)
  }
}
