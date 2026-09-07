import type { WorkspaceAgentSnapshot } from '../../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { CanvasArrangementSnapshot } from '../../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { CanvasObjectPosition } from '../../../contexts/canvas-arrangement/application/ports/CanvasLayoutCommitPort'
import { CommitCanvasLayoutUseCase } from '../../../contexts/canvas-arrangement/application/use-cases/CommitCanvasLayoutUseCase'
import type { CanvasArrangementSelectionItem } from '../../../contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import { findCanvasArrangementStacks } from '../../../contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import type { CanvasArrangementGridPlan } from '../projections/workbenchCanvasArrangementGridPlanning'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'

export async function commitCanvasArrangementLayout({
  api,
  arrangement,
  items,
  plan,
  workbench,
  workspaceId,
  moveWorkspaceAgent,
  setCurrentArrangement,
  setCurrentGraph
}: {
  readonly api: NonNullable<Window['cleancode']>
  readonly arrangement: CanvasArrangementSnapshot
  readonly items: readonly CanvasArrangementSelectionItem[]
  readonly plan: CanvasArrangementGridPlan
  readonly workbench: WorkbenchSnapshot
  readonly workspaceId: string
  readonly moveWorkspaceAgent: (
    agent: WorkspaceAgentSnapshot,
    position: { readonly x: number; readonly y: number },
    size: { readonly width: number; readonly height: number }
  ) => Promise<void>
  readonly setCurrentArrangement: (snapshot: CanvasArrangementSnapshot) => void
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
}): Promise<void> {
  const blocks = new Map(workbench.graph.blocks.map((block) => [block.id, block]))
  const groups = new Map(workbench.graph.terminalGroups.map((group) => [group.id, group]))
  const agents = new Map((workbench.agents ?? []).map((agent) => [agent.agentId, agent]))
  const targets = new Map(plan.layouts.map((layout) => [layout.key, layout.position]))
  const positions: CanvasObjectPosition[] = []
  const previousPositions: CanvasObjectPosition[] = []

  for (const item of items) {
    const target = targets.get(item.key)!
    const reference = item.reference
    if (reference.kind === 'agent' || reference.kind === 'combination') {
      const previous =
        reference.kind === 'agent'
          ? agents.get(reference.agentId)!.layout.position
          : groups.get(reference.terminalGroupId)!.position
      positions.push({ reference, position: target })
      previousPositions.push({ reference, position: previous })
    } else {
      for (const nodeId of item.nodeIds) {
        const block = blocks.get(nodeId)!
        const reference = { kind: 'terminal', terminalId: nodeId } as const
        positions.push({
          reference,
          position: plan.nodePositionsById.get(nodeId) ?? {
            x: block.position.x + target.x - item.position.x,
            y: block.position.y + target.y - item.position.y
          }
        })
        previousPositions.push({ reference, position: block.position })
      }
    }
  }

  const scope = {
    projectDirectory: workbench.project.directory,
    projectId: workbench.project.id,
    workspaceId
  }
  const graphScope = { projectDirectory: workbench.project.directory, workspaceId }
  const useCase = new CommitCanvasLayoutUseCase({
    async moveObjects(moves) {
      const results = await Promise.allSettled(
        moves.map(async ({ reference, position }) => {
          switch (reference.kind) {
            case 'agent': {
              const agent = agents.get(reference.agentId)!
              await moveWorkspaceAgent(agent, position, agent.layout.size)
              return undefined
            }
            case 'combination':
              return api.moveTerminalGroup({
                ...graphScope,
                terminalGroupId: reference.terminalGroupId,
                position
              })
            case 'terminal':
              return api.moveBlock({ ...graphScope, blockId: reference.terminalId, position })
          }
        })
      )
      const latestGraph = [...results]
        .reverse()
        .find(
          (result): result is PromiseFulfilledResult<WorkbenchSnapshot['graph']> =>
            result.status === 'fulfilled' && Boolean(result.value)
        )?.value
      if (latestGraph) setCurrentGraph(latestGraph)
      const failed = results.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
    },
    async removeStack(stack) {
      setCurrentArrangement(await api.removeCanvasStack({ ...scope, stackId: stack.id }))
    },
    async restoreStack(stack) {
      setCurrentArrangement(
        await api.createCanvasStack({
          ...scope,
          stackId: stack.id,
          anchor: stack.anchor,
          items: stack.items
        })
      )
    }
  })
  await useCase.execute({
    positions,
    previousPositions,
    stacks: findCanvasArrangementStacks(arrangement, items)
  })
}
