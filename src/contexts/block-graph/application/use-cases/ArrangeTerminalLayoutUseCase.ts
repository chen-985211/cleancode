import type { BlockGraphSnapshot, TerminalLayoutRegion } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { BlockGraph } from '../../domain/aggregates/BlockGraph'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface ArrangeTerminalLayoutCommand {
  readonly blockIds: readonly string[]
  readonly canvasRegions: readonly TerminalLayoutRegion[]
  readonly projectDirectory: string
  readonly workspaceId: string
}

export interface ArrangeTerminalLayoutResult {
  readonly arrangedBlockIds: readonly string[]
  readonly arrangedTerminalGroupIds: readonly string[]
  readonly graph: BlockGraphSnapshot
  readonly graphChanged: boolean
}

export class ArrangeTerminalLayoutUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: ArrangeTerminalLayoutCommand): Promise<ArrangeTerminalLayoutResult> {
    const observedGraph = await this.graphRepository.findDefaultGraphSnapshot(
      command.projectDirectory,
      command.workspaceId
    )
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => {
        const layoutInput = {
          blockIds: command.blockIds,
          canvasRegions: command.canvasRegions
        }
        const currentGraph = graph.toSnapshot()

        BlockGraph.fromSnapshot(currentGraph).arrangeTerminalLayout(layoutInput)
        const eligibleBlockIds = resolveEligibleBlockIds(
          currentGraph,
          observedGraph,
          command.blockIds
        )

        return eligibleBlockIds.length === 0
          ? {
              arrangedBlockIds: [],
              arrangedTerminalGroupIds: [],
              graphChanged: false
            }
          : graph.arrangeTerminalLayout({ ...layoutInput, blockIds: eligibleBlockIds })
      }
    )

    return { ...transaction.result, graph: transaction.graph }
  }
}

function resolveEligibleBlockIds(
  currentGraph: BlockGraphSnapshot,
  observedGraph: BlockGraphSnapshot | null,
  requestedBlockIds: readonly string[]
): string[] {
  if (!observedGraph) return [...requestedBlockIds]

  const currentBlocksById = new Map(currentGraph.blocks.map((block) => [block.id, block]))
  const observedBlocksById = new Map(observedGraph.blocks.map((block) => [block.id, block]))
  const protectedBlockIds = new Set(
    requestedBlockIds.filter((blockId) => {
      const current = currentBlocksById.get(blockId)
      const observed = observedBlocksById.get(blockId)

      return (
        !current ||
        !observed ||
        current.position.x !== observed.position.x ||
        current.position.y !== observed.position.y
      )
    })
  )

  for (const group of currentGraph.terminalGroups) {
    if (group.memberBlockIds.some((blockId) => protectedBlockIds.has(blockId))) {
      for (const blockId of group.memberBlockIds) protectedBlockIds.add(blockId)
    }
  }

  return requestedBlockIds.filter((blockId) => !protectedBlockIds.has(blockId))
}
