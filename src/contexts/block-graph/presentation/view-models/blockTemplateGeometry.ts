import type {
  BlockPositionSnapshot,
  TerminalBlockSizeSnapshot
} from '../../application/dto/BlockGraphSnapshot'
import type { BlockTemplateSnapshot } from '../../application/dto/BlockTemplateSnapshot'

const terminalGroupPadding = { x: 32, y: 76 }
const minimumTerminalGroupSize = { width: 520, height: 320 }

export interface BlockTemplateRect {
  readonly id: string
  readonly position: BlockPositionSnapshot
  readonly size: TerminalBlockSizeSnapshot
}

export interface BlockTemplateBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function projectBlockTemplateRects(
  template: BlockTemplateSnapshot,
  origin: BlockPositionSnapshot
): BlockTemplateRect[] {
  if (template.type === 'combination') {
    const nodeBounds = boundsOf(
      template.nodes.map((node) => ({
        id: node.templateNodeId,
        position: node.position,
        size: node.size
      }))
    )

    return [
      {
        id: template.id,
        position: {
          x: origin.x + nodeBounds.left - terminalGroupPadding.x,
          y: origin.y + nodeBounds.top - terminalGroupPadding.y
        },
        size: {
          width: Math.max(
            minimumTerminalGroupSize.width,
            nodeBounds.right - nodeBounds.left + terminalGroupPadding.x * 2
          ),
          height: Math.max(
            minimumTerminalGroupSize.height,
            nodeBounds.bottom - nodeBounds.top + terminalGroupPadding.y * 2
          )
        }
      }
    ]
  }

  return template.nodes.map((node) => ({
    id: node.templateNodeId,
    position: {
      x: origin.x + node.position.x,
      y: origin.y + node.position.y
    },
    size: node.size
  }))
}

export function resolveBlockTemplateBounds(
  template: BlockTemplateSnapshot,
  origin: BlockPositionSnapshot
): BlockTemplateBounds {
  const bounds = boundsOf(projectBlockTemplateRects(template, origin))
  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top
  }
}

function boundsOf(rects: readonly BlockTemplateRect[]) {
  return rects.reduce(
    (bounds, rect) => ({
      left: Math.min(bounds.left, rect.position.x),
      top: Math.min(bounds.top, rect.position.y),
      right: Math.max(bounds.right, rect.position.x + rect.size.width),
      bottom: Math.max(bounds.bottom, rect.position.y + rect.size.height)
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    }
  )
}
