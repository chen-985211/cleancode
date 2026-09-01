import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  CanvasArrangementSnapshot,
  CanvasStackSnapshot
} from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import {
  createSpreadCanvasLayout,
  createStackedCanvasLayout,
  type CanvasArrangementLayout
} from '../../contexts/canvas-arrangement/domain/services/CanvasArrangementLayoutPolicy'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { WorkbenchSnapshot } from './types'
import {
  canvasArrangementItemKey,
  findCanvasArrangementStack,
  findCanvasArrangementStacks,
  type CanvasArrangementSelectionItem
} from '../../contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import {
  createCanvasArrangementMotionChoreography,
  type CanvasArrangementMotionChoreography
} from '../../contexts/canvas-arrangement/presentation/motion/canvasArrangementMotion'
import { createCanvasArrangementGridPlan } from './workbenchCanvasArrangementGridPlanning'

interface UseCanvasArrangementActionsInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly moveWorkspaceAgent: (
    agent: WorkspaceAgentSnapshot,
    position: { readonly x: number; readonly y: number },
    size: { readonly width: number; readonly height: number }
  ) => Promise<void>
  readonly notify: (notification: {
    readonly kind: 'error'
    readonly message: string
    readonly title: string
  }) => void
  readonly failureMessage: string
  readonly failureTitle: string
  readonly setCurrentArrangement: (arrangement: CanvasArrangementSnapshot) => void
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
}

export function useCanvasArrangementActions({
  currentWorkbench,
  currentWorkspace,
  moveWorkspaceAgent,
  notify,
  failureMessage,
  failureTitle,
  setCurrentArrangement,
  setCurrentGraph
}: UseCanvasArrangementActionsInput) {
  const [isPending, setIsPending] = useState(false)
  const [motionChoreography, setMotionChoreography] =
    useState<CanvasArrangementMotionChoreography | null>(null)
  const motionCleanupFrameIdsRef = useRef<number[]>([])
  const motionCleanupSequenceRef = useRef(0)
  const clearMotionChoreography = useCallback((): void => {
    motionCleanupSequenceRef.current += 1
    motionCleanupFrameIdsRef.current.forEach((frameId) => window.cancelAnimationFrame(frameId))
    motionCleanupFrameIdsRef.current = []
    setMotionChoreography(null)
  }, [])
  const scheduleMotionChoreographyCleanup = useCallback((): void => {
    motionCleanupSequenceRef.current += 1
    const sequence = motionCleanupSequenceRef.current
    motionCleanupFrameIdsRef.current.forEach((frameId) => window.cancelAnimationFrame(frameId))
    motionCleanupFrameIdsRef.current = []
    // Flow nodes project from committed graph state in a passive effect. Keep the
    // choreography through that paint and the following presentation frame.
    const firstFrameId = window.requestAnimationFrame(() => {
      const secondFrameId = window.requestAnimationFrame(() => {
        if (motionCleanupSequenceRef.current !== sequence) return
        motionCleanupFrameIdsRef.current = []
        setMotionChoreography(null)
      })
      motionCleanupFrameIdsRef.current = [secondFrameId]
    })
    motionCleanupFrameIdsRef.current = [firstFrameId]
  }, [])
  useEffect(
    () => () => {
      motionCleanupSequenceRef.current += 1
      motionCleanupFrameIdsRef.current.forEach((frameId) => window.cancelAnimationFrame(frameId))
    },
    []
  )
  const commitLayouts = useCallback(
    async (
      selectedItems: readonly CanvasArrangementSelectionItem[],
      layouts: readonly CanvasArrangementLayout[],
      nodePositionsById: ReadonlyMap<string, { readonly x: number; readonly y: number }> = new Map()
    ): Promise<void> => {
      if (!currentWorkbench || !currentWorkspace || !window.cleancode) return
      const layoutsByKey = new Map(layouts.map((layout) => [layout.key, layout.position]))
      const graphPromises: Promise<WorkbenchSnapshot['graph']>[] = []
      const agentPromises: Promise<void>[] = []
      const blocksById = new Map(currentWorkbench.graph.blocks.map((block) => [block.id, block]))
      const agentsById = new Map(
        (currentWorkbench.agents ?? []).map((agent) => [agent.agentId, agent])
      )

      for (const item of selectedItems) {
        const target = layoutsByKey.get(item.key)
        if (!target) continue
        const delta = { x: target.x - item.position.x, y: target.y - item.position.y }

        if (item.reference.kind === 'combination') {
          graphPromises.push(
            window.cleancode.moveTerminalGroup({
              projectDirectory: currentWorkbench.project.directory,
              terminalGroupId: item.reference.terminalGroupId,
              workspaceId: currentWorkspace.workspaceId,
              position: target
            })
          )
          continue
        }

        if (item.reference.kind === 'agent') {
          const agent = agentsById.get(item.reference.agentId)
          if (!agent) continue
          agentPromises.push(
            moveWorkspaceAgent(
              agent,
              {
                x: agent.layout.position.x + delta.x,
                y: agent.layout.position.y + delta.y
              },
              agent.layout.size
            )
          )
          continue
        }

        for (const nodeId of item.nodeIds) {
          const block = blocksById.get(nodeId)
          if (!block) continue
          graphPromises.push(
            window.cleancode.moveBlock({
              blockId: block.id,
              projectDirectory: currentWorkbench.project.directory,
              workspaceId: currentWorkspace.workspaceId,
              position: nodePositionsById.get(nodeId) ?? {
                x: block.position.x + delta.x,
                y: block.position.y + delta.y
              }
            })
          )
        }
      }

      const [graphResults, agentResults] = await Promise.all([
        Promise.allSettled(graphPromises),
        Promise.allSettled(agentPromises)
      ])
      const failed = [...graphResults, ...agentResults].find(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      )
      if (failed) throw failed.reason
      const latestGraph = [...graphResults]
        .reverse()
        .find(
          (result): result is PromiseFulfilledResult<WorkbenchSnapshot['graph']> =>
            result.status === 'fulfilled'
        )?.value
      if (latestGraph) setCurrentGraph(latestGraph)
    },
    [currentWorkbench, currentWorkspace, moveWorkspaceAgent, setCurrentGraph]
  )
  const commitLayoutsWithRollback = useCallback(
    async (
      selectedItems: readonly CanvasArrangementSelectionItem[],
      layouts: readonly CanvasArrangementLayout[],
      rollbackLayouts: readonly CanvasArrangementLayout[],
      nodePositionsById?: ReadonlyMap<string, { readonly x: number; readonly y: number }>
    ): Promise<void> => {
      try {
        await commitLayouts(selectedItems, layouts, nodePositionsById)
      } catch (error) {
        await commitLayouts(selectedItems, rollbackLayouts).catch(() => undefined)
        throw error
      }
    },
    [commitLayouts]
  )

  const arrange = useCallback(
    async (
      action: 'detach-stack' | 'grid' | 'stack',
      items: readonly CanvasArrangementSelectionItem[]
    ): Promise<void> => {
      if (isPending || !currentWorkbench || !currentWorkspace || items.length < 2) return
      const api = window.cleancode
      if (!api) return
      const arrangement = currentWorkbench.canvasArrangement ?? emptyArrangement(currentWorkbench)
      const existingStack = findCanvasArrangementStack(arrangement, items)
      const overlappingStacks = findCanvasArrangementStacks(arrangement, items)
      const previousLayouts = items.map((item) => ({ key: item.key, position: item.position }))
      let completedSuccessfully = false

      clearMotionChoreography()
      setIsPending(true)
      try {
        if (action === 'stack') {
          setMotionChoreography(
            createCanvasArrangementMotionChoreography(
              withCombinationMembers(items, currentWorkbench.graph),
              'attach'
            )
          )
          const plan = createStackedCanvasLayout(items)
          await commitLayoutsWithRollback(items, plan.layouts, previousLayouts)
          try {
            const updated = await api.createCanvasStack({
              anchor: plan.anchor,
              items: items.map((item) => item.reference),
              projectDirectory: currentWorkbench.project.directory,
              projectId: currentWorkbench.project.id,
              stackId: createStackId(),
              workspaceId: currentWorkspace.workspaceId
            })
            setCurrentArrangement(updated)
            completedSuccessfully = true
          } catch (error) {
            await commitLayouts(items, previousLayouts)
            throw error
          }
          return
        }

        if (action === 'detach-stack') {
          if (!existingStack) return
          const stackItems = orderItemsForStack(items, existingStack)
          const stackPreviousLayouts = stackItems.map((item) => ({
            key: item.key,
            position: item.position
          }))
          setMotionChoreography(
            createCanvasArrangementMotionChoreography(
              withCombinationMembers(stackItems, currentWorkbench.graph),
              'detach'
            )
          )
          const plan = createSpreadCanvasLayout(stackItems, existingStack.anchor)
          await commitLayoutsWithRollback(stackItems, plan.layouts, stackPreviousLayouts)
          try {
            const updated = await api.removeCanvasStack({
              projectDirectory: currentWorkbench.project.directory,
              projectId: currentWorkbench.project.id,
              stackId: existingStack.id,
              workspaceId: currentWorkspace.workspaceId
            })
            setCurrentArrangement(updated)
            completedSuccessfully = true
          } catch (error) {
            await commitLayouts(stackItems, stackPreviousLayouts)
            throw error
          }
          return
        }

        const plan = createCanvasArrangementGridPlan(items, currentWorkbench.graph)
        setMotionChoreography(
          createCanvasArrangementMotionChoreography(
            withCombinationMembers(items, currentWorkbench.graph),
            'grid'
          )
        )
        if (overlappingStacks.length > 0) {
          await commitAndRemoveStacks(
            items,
            plan.layouts,
            overlappingStacks,
            plan.nodePositionsById
          )
        } else {
          await commitLayouts(items, plan.layouts, plan.nodePositionsById)
        }
        completedSuccessfully = true
      } catch {
        notify({ kind: 'error', message: failureMessage, title: failureTitle })
      } finally {
        if (completedSuccessfully) scheduleMotionChoreographyCleanup()
        else clearMotionChoreography()
        setIsPending(false)
      }

      async function commitAndRemoveStacks(
        selectedItems: readonly CanvasArrangementSelectionItem[],
        layouts: readonly CanvasArrangementLayout[],
        stacks: CanvasArrangementSnapshot['stacks'],
        nodePositionsById: ReadonlyMap<string, { readonly x: number; readonly y: number }>
      ): Promise<void> {
        await commitLayoutsWithRollback(selectedItems, layouts, previousLayouts, nodePositionsById)
        const removedStacks: CanvasArrangementSnapshot['stacks'][number][] = []
        try {
          let updated = arrangement
          for (const stack of stacks) {
            updated = await api!.removeCanvasStack({
              projectDirectory: currentWorkbench!.project.directory,
              projectId: currentWorkbench!.project.id,
              stackId: stack.id,
              workspaceId: currentWorkspace!.workspaceId
            })
            removedStacks.push(stack)
          }
          setCurrentArrangement(updated)
        } catch (error) {
          await commitLayouts(selectedItems, previousLayouts)
          let restored = arrangement
          for (const stack of removedStacks) {
            restored = await api!.createCanvasStack({
              anchor: stack.anchor,
              items: stack.items,
              projectDirectory: currentWorkbench!.project.directory,
              projectId: currentWorkbench!.project.id,
              stackId: stack.id,
              workspaceId: currentWorkspace!.workspaceId
            })
          }
          setCurrentArrangement(restored)
          throw error
        }
      }
    },
    [
      currentWorkbench,
      currentWorkspace,
      commitLayouts,
      commitLayoutsWithRollback,
      clearMotionChoreography,
      failureMessage,
      failureTitle,
      isPending,
      notify,
      scheduleMotionChoreographyCleanup,
      setCurrentArrangement
    ]
  )

  const moveStack = useCallback(
    async (
      stackId: string,
      previousAnchor: { readonly x: number; readonly y: number },
      nextAnchor: { readonly x: number; readonly y: number },
      items: readonly CanvasArrangementSelectionItem[]
    ): Promise<boolean> => {
      if (isPending || !currentWorkbench || !currentWorkspace || !window.cleancode) return false
      const delta = {
        x: nextAnchor.x - previousAnchor.x,
        y: nextAnchor.y - previousAnchor.y
      }
      const layouts = items.map((item) => ({
        key: item.key,
        position: { x: item.position.x + delta.x, y: item.position.y + delta.y }
      }))
      const previousLayouts = items.map((item) => ({ key: item.key, position: item.position }))

      setIsPending(true)
      try {
        await commitLayoutsWithRollback(items, layouts, previousLayouts)
        try {
          const updated = await window.cleancode.moveCanvasStack({
            anchor: nextAnchor,
            projectDirectory: currentWorkbench.project.directory,
            projectId: currentWorkbench.project.id,
            stackId,
            workspaceId: currentWorkspace.workspaceId
          })
          setCurrentArrangement(updated)
        } catch (error) {
          await commitLayouts(items, previousLayouts)
          throw error
        }
        return true
      } catch {
        notify({ kind: 'error', message: failureMessage, title: failureTitle })
        return false
      } finally {
        setIsPending(false)
      }
    },
    [
      commitLayouts,
      commitLayoutsWithRollback,
      currentWorkbench,
      currentWorkspace,
      failureMessage,
      failureTitle,
      isPending,
      notify,
      setCurrentArrangement
    ]
  )

  return { arrange, isPending, motionChoreography, moveStack }
}

function withCombinationMembers(
  items: readonly CanvasArrangementSelectionItem[],
  graph: WorkbenchSnapshot['graph']
): readonly { readonly nodeIds: readonly string[] }[] {
  const groupMembersById = new Map(
    graph.terminalGroups.map((group) => [group.id, group.memberBlockIds] as const)
  )
  return items.map((item) => ({
    nodeIds:
      item.reference.kind === 'combination'
        ? [
            ...new Set([
              ...item.nodeIds,
              ...(groupMembersById.get(item.reference.terminalGroupId) ?? [])
            ])
          ]
        : item.nodeIds
  }))
}

function orderItemsForStack(
  items: readonly CanvasArrangementSelectionItem[],
  stack: CanvasStackSnapshot
): readonly CanvasArrangementSelectionItem[] {
  const itemsByKey = new Map(items.map((item) => [item.key, item]))
  return stack.items.map((reference) => itemsByKey.get(canvasArrangementItemKey(reference))!)
}

function emptyArrangement(workbench: WorkbenchSnapshot): CanvasArrangementSnapshot {
  const workspace = workbench.project.workspaces.find((candidate) => candidate.isCurrent)
  return {
    projectId: workbench.project.id,
    workspaceId: workspace?.workspaceId ?? workbench.graph.workspaceId,
    stacks: []
  }
}

function createStackId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `stack-${Date.now().toString(36)}`
}
