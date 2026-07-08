import { Map as MapIcon, Maximize2, Minimize2, Minus, ZoomIn } from 'lucide-react'
import { useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'

import type { CanvasViewportSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  MinimapNodeInteractionContext,
  type MinimapNodeInteractionContextValue
} from './minimapInteraction'
import { MinimapWorkbenchNode } from './MinimapWorkbenchNode'
import type { MinimapFlowNode } from './types'

interface CanvasSize {
  readonly width: number
  readonly height: number
}

export interface MinimapViewportCenter {
  readonly x: number
  readonly y: number
}

interface CanvasMinimapProps {
  readonly isCollapsed: boolean
  readonly nodes: MinimapFlowNode[]
  readonly canvasViewport: CanvasViewportSnapshot
  readonly canvasSize: CanvasSize
  readonly viewportZoom: number
  readonly minimapNodeInteraction: MinimapNodeInteractionContextValue
  readonly onToggleCollapsed: () => void
  readonly onZoomOut: () => void
  readonly onZoomIn: () => void
  readonly onFitCanvas: () => void
  readonly onMinimapNodeClick: (blockId: string) => void
  readonly onViewportCenterPreview: (center: MinimapViewportCenter) => void
  readonly onViewportCenterCommit: (center: MinimapViewportCenter) => void
  readonly getMiniMapNodeColor: (node: MinimapFlowNode) => string
  readonly getMiniMapNodeStrokeColor: (node: MinimapFlowNode) => string
  readonly getMiniMapNodeClassName: (node: MinimapFlowNode) => string
}

interface MinimapFrame {
  readonly node: MinimapFlowNode
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface MinimapViewBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const minimapMapWidth = 260
const minimapMapHeight = 152
const minimapMapAspect = minimapMapWidth / minimapMapHeight
const minimapNodePadding = 132

export function CanvasMinimap({
  isCollapsed,
  nodes,
  canvasViewport,
  canvasSize,
  viewportZoom,
  minimapNodeInteraction,
  onToggleCollapsed,
  onZoomOut,
  onZoomIn,
  onFitCanvas,
  onMinimapNodeClick,
  onViewportCenterPreview,
  onViewportCenterCommit,
  getMiniMapNodeColor,
  getMiniMapNodeStrokeColor,
  getMiniMapNodeClassName
}: CanvasMinimapProps) {
  const isPanningViewportRef = useRef(false)
  const lastViewportCenterRef = useRef<MinimapViewportCenter | null>(null)
  const frames = nodes.map(toMinimapFrame)
  const viewBox = resolveMinimapViewBox(frames)
  const viewportFrame = resolveViewportFrame(canvasViewport, canvasSize)
  const minimapClassName = ['canvas-minimap', isCollapsed ? 'canvas-minimap--collapsed' : '']
    .filter(Boolean)
    .join(' ')
  const previewViewportCenter = (event: PointerEvent<SVGSVGElement>): void => {
    const center = resolveSvgPoint(event.currentTarget, event.clientX, event.clientY)

    if (!center) {
      return
    }

    lastViewportCenterRef.current = center
    onViewportCenterPreview(center)
  }
  const finishViewportPan = (event: PointerEvent<SVGSVGElement>): void => {
    if (!isPanningViewportRef.current) {
      return
    }

    isPanningViewportRef.current = false

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const center = lastViewportCenterRef.current
    lastViewportCenterRef.current = null

    if (center) {
      onViewportCenterCommit(center)
    }
  }

  return (
    <div className={minimapClassName}>
      {!isCollapsed ? (
        <div className="canvas-minimap__panel">
          <div className="canvas-minimap__map-frame">
            <MinimapNodeInteractionContext.Provider value={minimapNodeInteraction}>
              <svg
                className="canvas-minimap__map"
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                role="img"
                aria-labelledby="canvas-minimap-title"
                preserveAspectRatio="xMidYMid meet"
                onPointerDown={(event) => {
                  if (event.button !== 0 || isMinimapNodeTarget(event.target)) {
                    return
                  }

                  event.preventDefault()
                  isPanningViewportRef.current = true
                  event.currentTarget.setPointerCapture(event.pointerId)
                  previewViewportCenter(event)
                }}
                onPointerMove={(event) => {
                  if (!isPanningViewportRef.current) {
                    return
                  }

                  event.preventDefault()
                  previewViewportCenter(event)
                }}
                onPointerUp={finishViewportPan}
                onPointerCancel={finishViewportPan}
              >
                <title id="canvas-minimap-title">积木导航小地图</title>
                <rect
                  className="canvas-minimap__hit-area"
                  x={viewBox.x}
                  y={viewBox.y}
                  width={viewBox.width}
                  height={viewBox.height}
                />
                <rect
                  className="canvas-minimap__viewport-frame"
                  x={viewportFrame.x}
                  y={viewportFrame.y}
                  width={viewportFrame.width}
                  height={viewportFrame.height}
                  rx={16}
                />
                {frames.map((frame) => (
                  <MinimapWorkbenchNode
                    key={frame.node.id}
                    id={frame.node.id}
                    variant={frame.node.type === 'terminalGroup' ? 'terminalGroup' : 'terminal'}
                    kindLabel={frame.node.type === 'terminalGroup' ? '终端组合' : '终端'}
                    x={frame.x}
                    y={frame.y}
                    width={frame.width}
                    height={frame.height}
                    borderRadius={6}
                    className={getMiniMapNodeClassName(frame.node)}
                    color={getMiniMapNodeColor(frame.node)}
                    strokeColor={getMiniMapNodeStrokeColor(frame.node)}
                    strokeWidth={1.2}
                    selected={Boolean(frame.node.selected)}
                    onClick={(event: MouseEvent<SVGGElement>, blockId: string) => {
                      event.stopPropagation()
                      onMinimapNodeClick(blockId)
                    }}
                  />
                ))}
              </svg>
            </MinimapNodeInteractionContext.Provider>
          </div>
        </div>
      ) : null}
      <div className="canvas-minimap__controls" aria-label="小地图控制">
        <MinimapControlButton
          label={isCollapsed ? '展开小地图' : '收起小地图'}
          title={isCollapsed ? '展开小地图' : '收起小地图'}
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? (
            <Maximize2 size={13} aria-hidden="true" />
          ) : (
            <Minimize2 size={13} aria-hidden="true" />
          )}
        </MinimapControlButton>
        {!isCollapsed ? (
          <>
            <MinimapControlButton label="小地图放大" title="放大画布" onClick={onZoomIn}>
              <ZoomIn size={13} aria-hidden="true" />
            </MinimapControlButton>
            <span>{Math.round(viewportZoom * 100)}%</span>
            <MinimapControlButton label="小地图缩小" title="缩小画布" onClick={onZoomOut}>
              <Minus size={13} aria-hidden="true" />
            </MinimapControlButton>
            <MinimapControlButton label="小地图适应" title="适应画布" onClick={onFitCanvas}>
              <MapIcon size={13} aria-hidden="true" />
            </MinimapControlButton>
          </>
        ) : null}
      </div>
    </div>
  )
}

interface MinimapControlButtonProps {
  readonly label: string
  readonly title: string
  readonly onClick: () => void
  readonly children: ReactNode
}

function MinimapControlButton({ label, title, onClick, children }: MinimapControlButtonProps) {
  return (
    <button
      className="icon-button icon-button--small"
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function resolveMinimapViewBox(frames: MinimapFrame[]): MinimapViewBox {
  if (frames.length === 0) {
    return centeredViewBox({ x: 0, y: 0 }, 960, 960 / minimapMapAspect)
  }

  const focusedFrame = frames.find((frame) => frame.node.selected) ?? frames[0]!
  const center = {
    x: focusedFrame.x + focusedFrame.width / 2,
    y: focusedFrame.y + focusedFrame.height / 2
  }
  const graphBounds = frames.reduce(
    (bounds, frame) => ({
      minX: Math.min(bounds.minX, frame.x),
      minY: Math.min(bounds.minY, frame.y),
      maxX: Math.max(bounds.maxX, frame.x + frame.width),
      maxY: Math.max(bounds.maxY, frame.y + frame.height)
    }),
    {
      minX: focusedFrame.x,
      minY: focusedFrame.y,
      maxX: focusedFrame.x + focusedFrame.width,
      maxY: focusedFrame.y + focusedFrame.height
    }
  )

  let halfWidth = Math.max(
    focusedFrame.width * 1.12,
    center.x - graphBounds.minX + minimapNodePadding,
    graphBounds.maxX - center.x + minimapNodePadding,
    360
  )
  let halfHeight = Math.max(
    focusedFrame.height * 1.12,
    center.y - graphBounds.minY + minimapNodePadding,
    graphBounds.maxY - center.y + minimapNodePadding,
    220
  )

  if (halfWidth / halfHeight > minimapMapAspect) {
    halfHeight = halfWidth / minimapMapAspect
  } else {
    halfWidth = halfHeight * minimapMapAspect
  }

  return centeredViewBox(center, halfWidth * 2, halfHeight * 2)
}

function centeredViewBox(
  center: { readonly x: number; readonly y: number },
  width: number,
  height: number
): MinimapViewBox {
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height
  }
}

function resolveViewportFrame(
  viewport: CanvasViewportSnapshot,
  canvasSize: CanvasSize
): Omit<MinimapFrame, 'node'> {
  const zoom = Math.max(viewport.zoom, 0.01)
  const width = resolveCanvasDimension(canvasSize.width, 960) / zoom
  const height = resolveCanvasDimension(canvasSize.height, 640) / zoom

  return {
    x: -viewport.x / zoom,
    y: -viewport.y / zoom,
    width,
    height
  }
}

function toMinimapFrame(node: MinimapFlowNode): MinimapFrame {
  const fallbackSize = node.type === 'terminal' ? node.data.block.size : node.data.group.size
  const width = node.measured?.width ?? resolveDimension(node.style?.width) ?? fallbackSize.width
  const height =
    node.measured?.height ?? resolveDimension(node.style?.height) ?? fallbackSize.height

  return {
    node,
    x: node.position.x,
    y: node.position.y,
    width,
    height
  }
}

function resolveSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number
): MinimapViewportCenter | null {
  const screenMatrix = svg.getScreenCTM()

  if (!screenMatrix) {
    return null
  }

  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY

  const canvasPoint = point.matrixTransform(screenMatrix.inverse())

  return {
    x: canvasPoint.x,
    y: canvasPoint.y
  }
}

function isMinimapNodeTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest('[data-minimap-node-id]'))
}

function resolveCanvasDimension(value: number, fallback: number): number {
  return value > 0 ? value : fallback
}

function resolveDimension(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number.parseFloat(value)

    return Number.isFinite(parsedValue) ? parsedValue : null
  }

  return null
}
