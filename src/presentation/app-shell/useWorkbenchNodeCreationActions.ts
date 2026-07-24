import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

import {
  defaultTerminalBlockSize,
  type BlockGraphSnapshot,
  type TerminalBlockSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { useI18n } from './i18n/useI18n'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import { readWorkbenchCanvasCreationGeometry } from './workbenchCanvasSafeViewport'
import {
  createWorkbenchNodeCreationCoordinator,
  type WorkbenchNodeCreationReservation
} from './workbenchNodeCreationCoordinator'
import type { WorkbenchNodeSize } from './workbenchNodeCreationPolicy'
import { createWorkbenchNodeOccupancy } from './workbenchNodeOccupancy'
import type { WorkbenchNodeStore } from './workbenchNodeStore'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

export function useWorkbenchNodeCreationActions({
  currentWorkbench,
  currentWorkspace,
  focusCreatedTerminalBlock,
  nodeStore,
  reactFlowInstanceRef,
  setCurrentGraph
}: {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly focusCreatedTerminalBlock: (block: TerminalBlockSnapshot) => void
  readonly nodeStore: WorkbenchNodeStore
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly setCurrentGraph: (graph: BlockGraphSnapshot) => void
}) {
  const { t } = useI18n()
  const [nodeCreationCoordinator] = useState(createWorkbenchNodeCreationCoordinator)
  const workspaceScopeKey =
    currentWorkbench && currentWorkspace
      ? `${currentWorkbench.project.id}\0${currentWorkspace.name}`
      : null
  const workspaceScopeKeyRef = useRef(workspaceScopeKey)

  useEffect(() => {
    workspaceScopeKeyRef.current = workspaceScopeKey
  }, [workspaceScopeKey])

  const reserveWorkbenchNodeCreation = useCallback(
    (nodeSize: WorkbenchNodeSize): WorkbenchNodeCreationReservation | null => {
      const reactFlowInstance = reactFlowInstanceRef.current

      if (!reactFlowInstance || !workspaceScopeKey) {
        return null
      }

      const nodes = nodeStore.getNodes()

      return nodeCreationCoordinator.reserve({
        ...readWorkbenchCanvasCreationGeometry(),
        currentViewport: reactFlowInstance.getViewport(),
        nodeSize,
        occupiedRects: createWorkbenchNodeOccupancy(nodes),
        projectedNodeIds: nodes.map((node) => node.id),
        scopeKey: workspaceScopeKey
      })
    },
    [nodeCreationCoordinator, nodeStore, reactFlowInstanceRef, workspaceScopeKey]
  )

  const createTerminalBlock = useCallback(async () => {
    if (!currentWorkbench || !currentWorkspace) {
      return
    }

    const reservation = reserveWorkbenchNodeCreation(defaultTerminalBlockSize)

    if (!reservation) {
      return
    }

    const creationScopeKey = workspaceScopeKey
    const existingBlockIds = new Set(currentWorkbench.graph.blocks.map((block) => block.id))
    let isCommitted = false

    try {
      const graphSnapshot = await window.cleancode?.createTerminalBlock({
        projectDirectory: currentWorkbench.project.directory,
        workspaceName: currentWorkspace.name,
        name: t('terminal.defaultName', { index: currentWorkbench.graph.blocks.length + 1 }),
        description: t('terminal.defaultDescription'),
        position: reservation.position
      })

      if (!graphSnapshot || workspaceScopeKeyRef.current !== creationScopeKey) {
        return
      }

      setCurrentGraph(graphSnapshot)
      const createdBlock = graphSnapshot.blocks.find((block) => !existingBlockIds.has(block.id))

      if (createdBlock) {
        nodeCreationCoordinator.commit(reservation.reservationId, createdBlock.id)
        isCommitted = true
        focusCreatedTerminalBlock(createdBlock)
      }
    } finally {
      if (!isCommitted) {
        nodeCreationCoordinator.release(reservation.reservationId)
      }
    }
  }, [
    currentWorkbench,
    currentWorkspace,
    focusCreatedTerminalBlock,
    nodeCreationCoordinator,
    reserveWorkbenchNodeCreation,
    setCurrentGraph,
    t,
    workspaceScopeKey
  ])

  return {
    createTerminalBlock,
    nodeCreationCoordinator,
    reserveWorkbenchNodeCreation
  }
}
