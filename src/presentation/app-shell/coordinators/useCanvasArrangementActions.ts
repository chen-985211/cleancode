import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  CanvasArrangementSnapshot,
  CanvasStackSnapshot
} from '../../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import {
  createSpreadCanvasLayout,
  createStackedCanvasLayout
} from '../../../contexts/canvas-arrangement/domain/services/CanvasArrangementLayoutPolicy'
import type { WorkspaceAgentSnapshot } from '../../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'
import {
  canvasArrangementItemKey,
  findCanvasArrangementStack,
  type CanvasArrangementSelectionItem
} from '../../../contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import {
  createCanvasArrangementMotionChoreography,
  type CanvasArrangementMotionChoreography
} from '../../../contexts/canvas-arrangement/presentation/motion/canvasArrangementMotion'
import { createCanvasArrangementGridPlan } from '../projections/workbenchCanvasArrangementGridPlanning'
import {
  commitCanvasArrangementLayout,
  type CanvasArrangementCommitPlan
} from './commitCanvasArrangementLayout'
import type { CanvasLayoutRelationChange } from '../../../contexts/canvas-arrangement/application/use-cases/CommitCanvasLayoutUseCase'

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
  const pendingRef = useRef(false)
  const scopeKey = JSON.stringify([currentWorkbench?.project.id, currentWorkspace?.workspaceId])
  const [motionScope, setMotionScope] = useState(scopeKey)
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
  const commitPlan = useCallback(
    async (
      items: readonly CanvasArrangementSelectionItem[],
      plan: CanvasArrangementCommitPlan,
      relation?: CanvasLayoutRelationChange
    ) => {
      await commitCanvasArrangementLayout({
        api: window.cleancode!,
        arrangement: currentWorkbench!.canvasArrangement ?? emptyArrangement(currentWorkbench!),
        items,
        plan,
        relation,
        workbench: currentWorkbench!,
        workspaceId: currentWorkspace!.workspaceId,
        moveWorkspaceAgent,
        setCurrentArrangement,
        setCurrentGraph
      })
    },
    [currentWorkbench, currentWorkspace, moveWorkspaceAgent, setCurrentArrangement, setCurrentGraph]
  )

  const commitGridPlan = useCallback(
    async (items: readonly CanvasArrangementSelectionItem[], scope: 'selection' | 'canvas') => {
      const plan = createCanvasArrangementGridPlan(items, currentWorkbench!.graph, scope)
      setMotionChoreography(
        createCanvasArrangementMotionChoreography(
          withCombinationMembers(items, currentWorkbench!.graph),
          'grid'
        )
      )
      await commitPlan(items, plan)
      return plan.bounds
    },
    [currentWorkbench, commitPlan]
  )

  const organize = useCallback(
    async (items: readonly CanvasArrangementSelectionItem[]) => {
      if (
        pendingRef.current ||
        !currentWorkbench ||
        !currentWorkspace ||
        !window.cleancode ||
        items.length === 0
      )
        return null
      pendingRef.current = true
      setIsPending(true)
      setMotionScope(scopeKey)
      clearMotionChoreography()
      let completed = false
      try {
        const bounds = await commitGridPlan(items, 'canvas')
        completed = true
        return bounds
      } catch {
        notify({ kind: 'error', message: failureMessage, title: failureTitle })
        return null
      } finally {
        pendingRef.current = false
        setIsPending(false)
        if (completed) scheduleMotionChoreographyCleanup()
        else clearMotionChoreography()
      }
    },
    [
      currentWorkbench,
      currentWorkspace,
      scopeKey,
      clearMotionChoreography,
      commitGridPlan,
      notify,
      failureMessage,
      failureTitle,
      scheduleMotionChoreographyCleanup
    ]
  )

  const arrange = useCallback(
    async (
      action: 'detach-stack' | 'grid' | 'stack',
      items: readonly CanvasArrangementSelectionItem[]
    ): Promise<void> => {
      if (pendingRef.current || !currentWorkbench || !currentWorkspace || items.length < 2) return
      const api = window.cleancode
      if (!api) return
      const arrangement = currentWorkbench.canvasArrangement ?? emptyArrangement(currentWorkbench)
      const existingStack = findCanvasArrangementStack(arrangement, items)
      let completedSuccessfully = false

      clearMotionChoreography()
      pendingRef.current = true
      setMotionScope(scopeKey)
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
          await commitPlan(items, plan, {
            type: 'create-stack',
            stack: {
              id: createStackId(),
              anchor: plan.anchor,
              items: items.map((item) => item.reference)
            }
          })
          completedSuccessfully = true
          return
        }

        if (action === 'detach-stack') {
          if (!existingStack) return
          const stackItems = orderItemsForStack(items, existingStack)
          setMotionChoreography(
            createCanvasArrangementMotionChoreography(
              withCombinationMembers(stackItems, currentWorkbench.graph),
              'detach'
            )
          )
          const plan = createSpreadCanvasLayout(stackItems, existingStack.anchor)
          await commitPlan(stackItems, plan, { type: 'remove-stacks', stacks: [existingStack] })
          completedSuccessfully = true
          return
        }

        await commitGridPlan(items, 'selection')
        completedSuccessfully = true
      } catch {
        notify({ kind: 'error', message: failureMessage, title: failureTitle })
      } finally {
        if (completedSuccessfully) scheduleMotionChoreographyCleanup()
        else clearMotionChoreography()
        pendingRef.current = false
        setIsPending(false)
      }
    },
    [
      currentWorkbench,
      currentWorkspace,
      commitPlan,
      clearMotionChoreography,
      failureMessage,
      failureTitle,
      commitGridPlan,
      scopeKey,
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
      if (pendingRef.current || !currentWorkbench || !currentWorkspace || !window.cleancode)
        return false
      const delta = {
        x: nextAnchor.x - previousAnchor.x,
        y: nextAnchor.y - previousAnchor.y
      }
      const layouts = items.map((item) => ({
        key: item.key,
        position: { x: item.position.x + delta.x, y: item.position.y + delta.y }
      }))

      pendingRef.current = true
      setIsPending(true)
      try {
        await commitPlan(
          items,
          { layouts },
          {
            type: 'move-stack',
            stack: { id: stackId, anchor: nextAnchor, items: items.map((item) => item.reference) }
          }
        )
        return true
      } catch {
        notify({ kind: 'error', message: failureMessage, title: failureTitle })
        return false
      } finally {
        pendingRef.current = false
        setIsPending(false)
      }
    },
    [
      commitPlan,
      currentWorkbench,
      currentWorkspace,
      failureMessage,
      failureTitle,
      notify,
      setCurrentArrangement
    ]
  )

  return {
    arrange,
    organize,
    isPending,
    motionChoreography: motionScope === scopeKey ? motionChoreography : null,
    moveStack
  }
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
