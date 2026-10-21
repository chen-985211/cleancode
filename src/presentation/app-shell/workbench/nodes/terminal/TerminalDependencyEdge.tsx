import {
  BaseEdge,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
  type InternalNode
} from '@xyflow/react'
import { useLayoutEffect, useRef } from 'react'
import type { WorkbenchFlowNode } from '../../../types/workbenchFlowNode'
import { readTerminalEdgeMotionGeometry } from './terminalEdgeMotionGeometry'

export function TerminalDependencyEdge(props: EdgeProps) {
  const flow = useReactFlow<WorkbenchFlowNode>()
  const surfaceRef = useRef<SVGGElement>(null)
  const [path] = dependencyPath(
    props,
    nodeRect(flow.getInternalNode(props.source)),
    nodeRect(flow.getInternalNode(props.target))
  )
  const followsMotion = Boolean(props.data?.followsObjectMotion)
  useLayoutEffect(() => {
    if (!followsMotion) return
    let frame = 0
    let disposed = false
    const surface = surfaceRef.current
    const findSurface = (id: string): HTMLElement | null => {
      const terminal = document.querySelector(
        `[data-terminal-block-id="${CSS.escape(id)}"] .terminal-node`
      )
      const group = document.querySelector(`[data-terminal-group-id="${CSS.escape(id)}"]`)
      return (terminal ?? group) as HTMLElement | null
    }
    const source = findSurface(props.source)
    const target = findSurface(props.target)
    const readGeometry = (id: string, element: HTMLElement | null) => {
      const node = flow.getInternalNode(id)
      const rect = nodeRect(node)
      if (
        !rect ||
        !element ||
        !element.classList.contains('workbench-object-motion--spatial') ||
        node?.data.isObjectMotionFrozen
      )
        return rect ? { ...rect, opacity: 1 } : null
      return readTerminalEdgeMotionGeometry(rect, element.style, node?.data.objectMotion)
    }
    const present = () => {
      if (disposed || !surfaceRef.current) return
      const sourceRect = readGeometry(props.source, source)
      const targetRect = readGeometry(props.target, target)
      const [nextPath] = dependencyPath(props, sourceRect, targetRect)
      surfaceRef.current
        .querySelectorAll('path')
        .forEach((element) => element.setAttribute('d', nextPath))
      const visibleOpacity = (element: HTMLElement | null, opacity = 1) => {
        const hidden = element?.closest(
          '.terminal-node-anchor--parked, .workbench-object-presence--pending'
        )
        return hidden ? 0 : opacity
      }
      surfaceRef.current.style.opacity = String(
        Math.min(
          visibleOpacity(source, sourceRect?.opacity),
          visibleOpacity(target, targetRect?.opacity)
        )
      )
      frame = requestAnimationFrame(present)
    }
    // Subscribe after node layout effects so each frame follows the spring writes.
    queueMicrotask(present)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      surface?.style.removeProperty('opacity')
    }
  }, [flow, followsMotion, props])
  return (
    <g ref={surfaceRef}>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={props.interactionWidth}
      />
    </g>
  )
}

function nodeRect(node: InternalNode<WorkbenchFlowNode> | undefined) {
  if (!node) return null
  return {
    ...node.internals.positionAbsolute,
    width: typeof node.style?.width === 'number' ? node.style.width : (node.measured.width ?? 0),
    height: typeof node.style?.height === 'number' ? node.style.height : (node.measured.height ?? 0)
  }
}

// Static layout, direct dragging and spring presentation use the same attachment
// points. React Flow's handle bounds include the handle's radius outside the node.
function dependencyPath(
  props: EdgeProps,
  source: ReturnType<typeof nodeRect>,
  target: ReturnType<typeof nodeRect>
) {
  return getBezierPath({
    ...props,
    sourceX: source ? source.x + source.width : props.sourceX,
    sourceY: source ? source.y + source.height / 2 : props.sourceY,
    targetX: target ? target.x : props.targetX,
    targetY: target ? target.y + target.height / 2 : props.targetY
  })
}
