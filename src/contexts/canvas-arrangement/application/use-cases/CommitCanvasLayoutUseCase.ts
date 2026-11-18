import type { CanvasStackSnapshot } from '../dto/CanvasArrangementSnapshot'
import type { CanvasLayoutCommitPort, CanvasObjectPosition } from '../ports/CanvasLayoutCommitPort'

export type CanvasLayoutRelationChange =
  | { readonly type: 'remove-stacks'; readonly stacks: readonly CanvasStackSnapshot[] }
  | { readonly type: 'create-stack' | 'move-stack'; readonly stack: CanvasStackSnapshot }

export interface CommitCanvasLayoutCommand {
  readonly positions: readonly CanvasObjectPosition[]
  readonly previousPositions: readonly CanvasObjectPosition[]
  readonly relation: CanvasLayoutRelationChange
}

export class CommitCanvasLayoutUseCase {
  constructor(private readonly port: CanvasLayoutCommitPort) {}

  async execute(command: CommitCanvasLayoutCommand): Promise<void> {
    const removedStacks: CanvasStackSnapshot[] = []
    try {
      await this.port.moveObjects(command.positions)
      const relation = command.relation
      switch (relation.type) {
        case 'create-stack':
          await this.port.createStack(relation.stack)
          break
        case 'move-stack':
          await this.port.moveStack(relation.stack)
          break
        case 'remove-stacks':
          for (const stack of relation.stacks) {
            await this.port.removeStack(stack)
            removedStacks.push(stack)
          }
      }
    } catch (error) {
      const failures: unknown[] = [error]
      // Restore exact committed member coordinates, including compacted workflows.
      await this.port.moveObjects(command.previousPositions).catch((failure: unknown) => {
        failures.push(failure)
      })
      for (const stack of removedStacks) {
        await this.port.restoreStack(stack).catch((failure: unknown) => {
          failures.push(failure)
        })
      }
      if (failures.length > 1) {
        throw new AggregateError(failures, 'Canvas layout compensation was incomplete.')
      }
      throw error
    }
  }
}
