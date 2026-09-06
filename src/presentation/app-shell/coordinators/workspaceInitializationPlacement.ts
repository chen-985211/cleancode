import type { WorkspaceInitializationDetails } from '../../../contexts/project/application/dto/WorkspaceInitializationDetails'
import { defaultAgentLayoutSize } from '../../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import {
  projectBlockTemplateRects,
  resolveBlockTemplateBounds
} from '../../../contexts/block-graph/presentation/view-models/blockTemplateGeometry'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'
import { resolveBlockTemplatePlacement } from '../workbench/creation/blockTemplatePlacement'
import {
  resolveWorkbenchNodeCreationPlan,
  workbenchNodePlacementGap,
  type WorkbenchCanvasRect
} from '../workbench/creation/workbenchNodeCreationPolicy'

export function workspaceInitializationPositions(
  details: WorkspaceInitializationDetails,
  workbench: WorkbenchSnapshot,
  retryItemId?: string
) {
  const grouped = new Set(workbench.graph.terminalGroups.flatMap((group) => group.memberBlockIds))
  const occupied: WorkbenchCanvasRect[] = [
    ...workbench.graph.blocks.filter((block) => !grouped.has(block.id)),
    ...workbench.graph.terminalGroups,
    ...(workbench.agents ?? []).map((agent) => ({ id: agent.agentId, ...agent.layout }))
  ]
  const positions = []
  for (const item of details.initialization.items) {
    if (item.status === 'created' || item.status === 'skipped') continue
    const left = occupied.length
      ? Math.max(...occupied.map((rect) => rect.position.x + rect.size.width)) +
        workbenchNodePlacementGap
      : 0
    const template = details.templates.find((candidate) => candidate.itemId === item.id)?.template
    let position = item.id === retryItemId ? null : item.position
    if (template) {
      const bounds = resolveBlockTemplateBounds(template, { x: 0, y: 0 })
      position =
        position ??
        resolveBlockTemplatePlacement({
          desiredCenter: { x: left + bounds.width / 2, y: bounds.height / 2 },
          occupiedRects: occupied,
          template
        })
      occupied.push(...projectBlockTemplateRects(template, position))
    } else {
      position =
        position ??
        resolveWorkbenchNodeCreationPlan({
          canvasSize: defaultAgentLayoutSize,
          safeViewport: { x: 0, y: 0, ...defaultAgentLayoutSize },
          currentViewport: { x: -left, y: 0, zoom: 1 },
          nodeSize: defaultAgentLayoutSize,
          occupiedRects: occupied
        }).position
      occupied.push({ id: item.id, position, size: defaultAgentLayoutSize })
    }
    positions.push({ itemId: item.id, ...position })
  }
  return positions
}
