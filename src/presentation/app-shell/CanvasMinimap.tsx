import { ChevronUp, Map as MapIcon, Minus, Plus, Scan } from 'lucide-react'
import { useCallback, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'

import type { CanvasViewportSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { defaultAgentLayoutSize } from '../../contexts/agent/domain/aggregates/AgentSession'
import {
  MinimapNodeInteractionContext,
  type MinimapNodeInteractionContextValue
} from './minimapInteraction'
import { MinimapWorkbenchNode } from './MinimapWorkbenchNode'
import type { MinimapFlowNode } from './types'
import type { ApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import { useI18n } from './i18n/useI18n'
import { TooltipLabel } from './Tooltip'

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
  readonly shortcutTooltips: Pick<
    ApplicationShortcutTooltipLabels,
    'fitCanvas' | 'toggleMinimap' | 'zoomCanvasIn' | 'zoomCanvasOut'
  >
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

const minimapMapWidth = 184
const minimapMapHeight = 120
const minimapMapAspect = minimapMapWidth / minimapMapHeight
const minimapNodePadding = 132
const minimapMinimumWidth = 720
const minimapMinimumHeight = 440

export function CanvasMinimap({
  isCollapsed,
  nodes,
  canvasViewport,
  canvasSize,
  viewportZoom,
  shortcutTooltips,
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
  const { t } = useI18n()
  const isPanningViewportRef = useRef(false)
  const lastViewportCenterRef = useRef<MinimapViewportCenter | null>(null)
  const focusMinimapNode = useCallback(
    (_event: MouseEvent<SVGGElement>, blockId: string): void => onMinimapNodeClick(blockId),
    [onMinimapNodeClick]
  )
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
    <div className={minimapClassName} data-workbench-canvas-obstruction>
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
                <title id="canvas-minimap-title">{t('minimap.title')}</title>
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
                    variant={resolveMinimapNodeVariant(frame.node)}
                    kindLabel={
                      frame.node.type === 'agentConsole'
                        ? 'Agent'
                        : frame.node.type === 'terminalGroup'
                          ? t('minimap.terminalGroup')
                          : t('minimap.terminal')
                    }
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
                    onClick={focusMinimapNode}
                  />
                ))}
              </svg>
            </MinimapNodeInteractionContext.Provider>
          </div>
          <div
            className="canvas-minimap__map-controls"
            role="group"
            aria-label={t('minimap.controls')}
          >
            <MinimapControlButton
              label={t('minimap.collapse')}
              tooltip={shortcutTooltips.toggleMinimap}
              onClick={onToggleCollapsed}
            >
              <ChevronUp size={13} aria-hidden="true" />
            </MinimapControlButton>
          </div>
        </div>
      ) : null}
      <div className="canvas-minimap__navigation-row">
        {isCollapsed ? (
          <div
            className="canvas-minimap__map-controls canvas-minimap__map-controls--collapsed"
            role="group"
            aria-label={t('minimap.controls')}
          >
            <MinimapControlButton
              label={t('minimap.expand')}
              tooltip={shortcutTooltips.toggleMinimap}
              onClick={onToggleCollapsed}
            >
              <MapIcon size={14} aria-hidden="true" />
            </MinimapControlButton>
          </div>
        ) : null}
        <div
          className="canvas-minimap__viewport-controls"
          role="group"
          aria-label={t('canvas.viewportControls')}
        >
          <MinimapControlButton
            label={t('minimap.zoomOutTitle')}
            tooltip={shortcutTooltips.zoomCanvasOut}
            onClick={onZoomOut}
          >
            <Minus size={14} aria-hidden="true" />
          </MinimapControlButton>
          <output aria-label={t('minimap.zoomLevel')}>{Math.round(viewportZoom * 100)}%</output>
          <MinimapControlButton
            label={t('minimap.zoomInTitle')}
            tooltip={shortcutTooltips.zoomCanvasIn}
            onClick={onZoomIn}
          >
            <Plus size={14} aria-hidden="true" />
          </MinimapControlButton>
          <span className="canvas-minimap__viewport-divider" aria-hidden="true" />
          <MinimapControlButton
            label={t('minimap.fitTitle')}
            tooltip={shortcutTooltips.fitCanvas}
            onClick={onFitCanvas}
          >
            <Scan size={14} aria-hidden="true" />
          </MinimapControlButton>
        </div>
      </div>
    </div>
  )
}

interface MinimapControlButtonProps {
  readonly label: string
  readonly tooltip: string
  readonly onClick: () => void
  readonly children: ReactNode
}

function MinimapControlButton({ label, tooltip, onClick, children }: MinimapControlButtonProps) {
  return (
    <TooltipLabel content={tooltip}>
      <button
        className="icon-button icon-button--small"
        type="button"
        aria-label={label}
        onClick={onClick}
      >
        {children}
      </button>
    </TooltipLabel>
  )
}

function resolveMinimapViewBox(frames: MinimapFrame[]): MinimapViewBox {
  if (frames.length === 0) {
    return centeredViewBox({ x: 0, y: 0 }, 960, 960 / minimapMapAspect)
  }

  const firstFrame = frames[0]!
  const graphBounds = frames.reduce(
    (bounds, frame) => ({
      minX: Math.min(bounds.minX, frame.x),
      minY: Math.min(bounds.minY, frame.y),
      maxX: Math.max(bounds.maxX, frame.x + frame.width),
      maxY: Math.max(bounds.maxY, frame.y + frame.height),
      maximumNodeWidth: Math.max(bounds.maximumNodeWidth, frame.width),
      maximumNodeHeight: Math.max(bounds.maximumNodeHeight, frame.height)
    }),
    {
      minX: firstFrame.x,
      minY: firstFrame.y,
      maxX: firstFrame.x + firstFrame.width,
      maxY: firstFrame.y + firstFrame.height,
      maximumNodeWidth: firstFrame.width,
      maximumNodeHeight: firstFrame.height
    }
  )
  const center = {
    x: (graphBounds.minX + graphBounds.maxX) / 2,
    y: (graphBounds.minY + graphBounds.maxY) / 2
  }

  let width = Math.max(
    graphBounds.maxX - graphBounds.minX + minimapNodePadding * 2,
    graphBounds.maximumNodeWidth * 2.24,
    minimapMinimumWidth
  )
  let height = Math.max(
    graphBounds.maxY - graphBounds.minY + minimapNodePadding * 2,
    graphBounds.maximumNodeHeight * 2.24,
    minimapMinimumHeight
  )

  if (width / height > minimapMapAspect) {
    height = width / minimapMapAspect
  } else {
    width = height * minimapMapAspect
  }

  return centeredViewBox(center, width, height)
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
  const fallbackSize =
    node.type === 'agentConsole'
      ? defaultAgentLayoutSize
      : node.type === 'terminal'
        ? node.data.block.size
        : node.data.group.size
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

function resolveMinimapNodeVariant(
  node: MinimapFlowNode
): 'agentConsole' | 'terminal' | 'terminalGroup' {
  return node.type
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
