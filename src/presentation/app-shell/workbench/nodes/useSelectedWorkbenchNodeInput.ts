import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'

import { createCanvasObjectIdentityKey } from '../../../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'
import {
  activateWorkbenchNodeInput,
  createWorkbenchNodeInputSurfaceReadiness,
  isExactWorkbenchNodeInputTarget
} from '../creation/workbenchNodeInputActivation'
import { scheduleWorkbenchNodeInputActivation } from '../creation/scheduleWorkbenchNodeInputActivation'
import { isWorkbenchNodePresentationHidden } from '../../projections/workbenchNodeVisibility'

export function useSelectedWorkbenchNodeInput(
  instanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
) {
  const pendingRef = useRef<{
    readonly node: WorkbenchFlowNode
    readonly cancel: () => void
  } | null>(null)
  const cancelSelectedNodeInput = useCallback(() => {
    pendingRef.current?.cancel()
    pendingRef.current = null
  }, [])

  useEffect(() => {
    const cancelOutsideInput = (event: Event): void => {
      const pending = pendingRef.current
      if (pending && isExactWorkbenchNodeInputTarget(pending.node, event.target)) return
      cancelSelectedNodeInput()
    }
    document.addEventListener('pointerdown', cancelSelectedNodeInput, true)
    document.addEventListener('wheel', cancelSelectedNodeInput, true)
    document.addEventListener('focusin', cancelOutsideInput, true)
    document.addEventListener('keydown', cancelOutsideInput, true)
    window.addEventListener('blur', cancelSelectedNodeInput)
    return () => {
      cancelSelectedNodeInput()
      document.removeEventListener('pointerdown', cancelSelectedNodeInput, true)
      document.removeEventListener('wheel', cancelSelectedNodeInput, true)
      document.removeEventListener('focusin', cancelOutsideInput, true)
      document.removeEventListener('keydown', cancelOutsideInput, true)
      window.removeEventListener('blur', cancelSelectedNodeInput)
    }
  }, [cancelSelectedNodeInput])

  const activateSelectedWorkbenchNodeInput = useCallback(
    (nodeId: string, transitionCompletion: Promise<boolean>): void => {
      cancelSelectedNodeInput()
      const instance = instanceRef.current
      const node = instance?.getNode(nodeId)
      if (!node || node.type === 'terminalGroup' || !node.data.identity) return
      const identityKey = createCanvasObjectIdentityKey(node.data.identity)
      const readiness = createWorkbenchNodeInputSurfaceReadiness(node)
      const isCurrentSelection = (): boolean => {
        const current = instanceRef.current?.getNode(nodeId)
        return Boolean(
          instanceRef.current === instance &&
          current?.selected &&
          !current.dragging &&
          !isWorkbenchNodePresentationHidden(current) &&
          current.data.identity &&
          createCanvasObjectIdentityKey(current.data.identity) === identityKey &&
          instance?.getNodes().filter((candidate) => candidate.selected).length === 1
        )
      }
      const cancel = scheduleWorkbenchNodeInputActivation({
        activate: () => isCurrentSelection() && activateWorkbenchNodeInput(node),
        isReady: () => isCurrentSelection() && readiness.isReady(),
        transitionCompletion
      })
      pendingRef.current = { node, cancel }
    },
    [cancelSelectedNodeInput, instanceRef]
  )

  return { activateSelectedWorkbenchNodeInput, cancelSelectedNodeInput }
}
