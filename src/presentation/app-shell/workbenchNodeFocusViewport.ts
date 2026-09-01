import {
  maximumCanvasZoom,
  minimumCanvasZoom
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from './types/workbenchFlowNode'

export interface WorkbenchNodeFocusSize {
  readonly width: number
  readonly height: number
}

interface ResolveWorkbenchNodeFocusZoomInput {
  readonly canvasSize: WorkbenchNodeFocusSize
  readonly currentZoom: number
  readonly nodeSize: WorkbenchNodeFocusSize
}

const focusSafeWidthRatio = 0.72
const focusSafeHeightRatio = 0.68
const workbenchNodeReadableZoom = 0.9
const zoomChangeThresholdRatio = 0.08
const fallbackCanvasSize = { width: 960, height: 640 }

export function resolveWorkbenchNodeFocusZoom({
  canvasSize,
  currentZoom,
  nodeSize
}: ResolveWorkbenchNodeFocusZoomInput): number {
  const normalizedCurrentZoom = clampZoom(currentZoom)
  const safeWidth =
    resolvePositiveDimension(canvasSize.width, fallbackCanvasSize.width) * focusSafeWidthRatio
  const safeHeight =
    resolvePositiveDimension(canvasSize.height, fallbackCanvasSize.height) * focusSafeHeightRatio
  const fitZoom = clampZoom(
    Math.min(
      safeWidth / resolvePositiveDimension(nodeSize.width, safeWidth),
      safeHeight / resolvePositiveDimension(nodeSize.height, safeHeight)
    )
  )
  const preferredZoom = Math.max(normalizedCurrentZoom, workbenchNodeReadableZoom)
  const targetZoom = clampZoom(Math.min(preferredZoom, fitZoom))

  return isMaterialZoomChange(normalizedCurrentZoom, targetZoom)
    ? targetZoom
    : normalizedCurrentZoom
}

export function resolveWorkbenchNodeSize(node: WorkbenchFlowNode): WorkbenchNodeFocusSize {
  const measuredOrStyledWidth =
    node.measured?.width ?? node.width ?? resolveDimension(node.style?.width)
  const measuredOrStyledHeight =
    node.measured?.height ?? node.height ?? resolveDimension(node.style?.height)

  if (measuredOrStyledWidth !== null && measuredOrStyledHeight !== null) {
    return { width: measuredOrStyledWidth, height: measuredOrStyledHeight }
  }

  const fallbackSize =
    node.type === 'agentConsole'
      ? node.data.agent.layout.size
      : node.type === 'terminal'
        ? node.data.block.size
        : node.data.group.size

  return {
    width: measuredOrStyledWidth ?? fallbackSize.width,
    height: measuredOrStyledHeight ?? fallbackSize.height
  }
}

function isMaterialZoomChange(currentZoom: number, targetZoom: number): boolean {
  return Math.abs(targetZoom - currentZoom) / currentZoom >= zoomChangeThresholdRatio
}

function clampZoom(zoom: number): number {
  const normalizedZoom = Number.isFinite(zoom) ? zoom : 1
  return Math.min(maximumCanvasZoom, Math.max(minimumCanvasZoom, normalizedZoom))
}

function resolvePositiveDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function resolveDimension(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsedValue = Number.parseFloat(value)
  return Number.isFinite(parsedValue) ? parsedValue : null
}
