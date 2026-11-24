import { useRef, type MouseEvent, type PointerEvent } from 'react'
import {
  ProjectTodoDrawer,
  type ProjectTodoDrawerHandle
} from '../../../contexts/todo/presentation/ProjectTodoDrawer'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import type { WorkbenchCanvasProps } from './workbenchCanvasProps'
import type { useBlockTemplateCanvasInteraction } from './creation/useBlockTemplateCanvasInteraction'
import type { useCanvasConnectionInteraction } from './useCanvasConnectionInteraction'

import type { useCanvasObjectContextMenu } from './menus/useCanvasObjectContextMenu'
import type { useCanvasPaneContextMenu } from './menus/useCanvasPaneContextMenu'
import { isWorkbenchDirectZoomActive } from './viewport/workbenchDirectZoom'
import { isWorkbenchViewportMotionActive } from './viewport/workbenchViewportMotion'

export function useWorkbenchPaneInteraction({
  projectId,
  editingTerminalGroupId,
  reactFlowInstanceRef,
  objectContextMenu,
  paneContextMenu,
  connectionInteraction,
  templateInteraction,
  placing,
  nodes,
  onPaneClick,
  canvasBusy
}: {
  projectId?: string
  editingTerminalGroupId: string | null
  reactFlowInstanceRef: WorkbenchCanvasProps['reactFlowInstanceRef']
  objectContextMenu: ReturnType<typeof useCanvasObjectContextMenu>
  paneContextMenu: ReturnType<typeof useCanvasPaneContextMenu>
  connectionInteraction: ReturnType<typeof useCanvasConnectionInteraction>
  templateInteraction: ReturnType<typeof useBlockTemplateCanvasInteraction>
  placing: boolean
  nodes: readonly WorkbenchFlowNode[]
  onPaneClick: WorkbenchCanvasProps['onPaneClick']
  canvasBusy: boolean
}) {
  const drawer = useRef<ProjectTodoDrawerHandle>(null)
  const idlePress = useRef(false)
  const dismissedOnLastClick = useRef(false)

  function canvasHasInteraction() {
    const instance = reactFlowInstanceRef.current
    return (
      canvasBusy ||
      !!editingTerminalGroupId ||
      (instance &&
        (isWorkbenchDirectZoomActive(instance) || isWorkbenchViewportMotionActive(instance))) ||
      placing ||
      objectContextMenu.isOpen ||
      paneContextMenu.isOpen ||
      !!templateInteraction.canvasSelection ||
      nodes.some((node) => node.selected || node.dragging) ||
      connectionInteraction.flowProps.edges.some((edge) => edge.selected)
    )
  }

  function capturePress(event: PointerEvent) {
    // Outside presses can close a canvas menu before React Flow delivers the pane click.
    idlePress.current =
      !!drawer.current?.open &&
      event.button === 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      event.target instanceof Element &&
      event.target.classList.contains('react-flow__pane') &&
      !canvasHasInteraction()
  }

  function click(event: MouseEvent) {
    // After dismissal, later clicks in the same native sequence still belong to the drawer.
    if (dismissedOnLastClick.current && event.detail > 1) return
    dismissedOnLastClick.current = false
    if (drawer.current?.open && idlePress.current && !canvasHasInteraction()) {
      idlePress.current = false
      dismissedOnLastClick.current = true
      drawer.current.close()
      return
    }
    connectionInteraction.clearSelection()
    objectContextMenu.close()
    paneContextMenu.close()
    if (placing) return
    templateInteraction.clearSelection()
    onPaneClick(drawer.current?.open ? 'preserve-viewport' : undefined)
  }

  function onNodeContextMenu(event: MouseEvent<Element>, node: WorkbenchFlowNode) {
    if (node.type === 'terminalGroup' && node.id === editingTerminalGroupId) {
      objectContextMenu.close()
      paneContextMenu.open(event)
      return
    }
    paneContextMenu.close()
    objectContextMenu.onNodeContextMenu(event, node)
  }

  return {
    onNodeContextMenu,
    capturePress,
    click,
    drawer:
      projectId && window.cleancode?.listTodos ? (
        <ProjectTodoDrawer projectId={projectId} api={window.cleancode} ref={drawer} />
      ) : null
  }
}
