import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useMemo } from 'react'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { activateWorkbenchNodeInput } from './workbenchNodeInputActivation'
import {
  createMinimapNodeInteraction,
  type MinimapNodeInteractionContextValue
} from './minimapInteraction'
import type { WorkbenchFlowNode } from './types/workbenchFlowNode'
import type { WorkbenchSnapshot } from './types/workbenchSnapshot'

export function createNodeInputActivator(
  cancelPendingFocus: () => void
): (node: WorkbenchFlowNode) => void {
  return (node) => {
    cancelPendingFocus()
    activateWorkbenchNodeInput(node)
  }
}

export function useMinimapNodeInteraction(
  agents: readonly WorkspaceAgentSnapshot[] | undefined,
  setHoveredBlockId: (blockId: string | null) => void,
  terminalBlocksById: ReadonlyMap<string, TerminalBlockSnapshot>,
  terminalGroupsById: ReadonlyMap<string, TerminalGroupSnapshot>
): MinimapNodeInteractionContextValue {
  return useMemo(
    () =>
      createMinimapNodeInteraction({
        agents,
        setHoveredBlockId,
        terminalBlocksById,
        terminalGroupsById
      }),
    [agents, setHoveredBlockId, terminalBlocksById, terminalGroupsById]
  )
}

export function hasMultipleWorkspaces(workbenches: readonly WorkbenchSnapshot[]): boolean {
  return workbenches.reduce((count, item) => count + item.project.workspaces.length, 0) > 1
}

export function createGroupAtWindowCenter(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge> | null,
  createGroup: (position: { readonly x: number; readonly y: number }) => void
): void {
  if (!instance) return
  void createGroup(
    instance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  )
}
