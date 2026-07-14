import {
  defaultCanvasViewport,
  defaultTerminalBlockSize,
  maximumCanvasZoom,
  minimumCanvasZoom,
  minimumTerminalBlockSize,
  type CanvasViewportSnapshot,
  type RestorableTerminalBlockSnapshot,
  type TerminalBlockSizeSnapshot,
  type TerminalBlockSnapshot
} from '../aggregates/BlockGraphTypes'
import { normalizeRestoredTerminalExecutionConfig } from './TerminalWorkflowRules'

export function normalizeCanvasViewport(
  viewport: Partial<CanvasViewportSnapshot> | undefined,
  fallback: CanvasViewportSnapshot = defaultCanvasViewport
): CanvasViewportSnapshot {
  return {
    x: normalizeViewportCoordinate(viewport?.x, fallback.x),
    y: normalizeViewportCoordinate(viewport?.y, fallback.y),
    zoom: normalizeCanvasZoom(viewport?.zoom, fallback.zoom)
  }
}

export function normalizeTerminalBlock(
  block: RestorableTerminalBlockSnapshot
): TerminalBlockSnapshot {
  return {
    ...block,
    executionConfig: normalizeRestoredTerminalExecutionConfig(block.executionConfig),
    launchCommand: normalizeTerminalLaunchCommand(block.launchCommand),
    size: normalizeTerminalBlockSize(block.size)
  }
}

export function normalizeTerminalLaunchCommand(command: string | undefined): string {
  return command?.trim() ?? ''
}

export function normalizeTerminalBlockSize(
  size: Partial<TerminalBlockSizeSnapshot> | undefined
): TerminalBlockSizeSnapshot {
  return {
    width: normalizeSizeValue(
      size?.width,
      minimumTerminalBlockSize.width,
      defaultTerminalBlockSize.width
    ),
    height: normalizeSizeValue(
      size?.height,
      minimumTerminalBlockSize.height,
      defaultTerminalBlockSize.height
    )
  }
}

function normalizeViewportCoordinate(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeCanvasZoom(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(maximumCanvasZoom, Math.max(minimumCanvasZoom, value))
}

function normalizeSizeValue(value: number | undefined, minimum: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(minimum, Math.round(value))
}
