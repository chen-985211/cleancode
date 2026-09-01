import type { BlockTemplateSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockTemplateSnapshot'
import { projectBlockTemplateRects } from '../../../src/contexts/block-graph/presentation/view-models/blockTemplateGeometry'
import { resolveBlockTemplatePlacement } from '../../../src/presentation/app-shell/workbench/creation/blockTemplatePlacement'

describe('block template placement', () => {
  it('centers an unobstructed template on the clicked canvas point', () => {
    const template = createWorkflowTemplate()

    expect(
      resolveBlockTemplatePlacement({
        desiredCenter: { x: 500, y: 400 },
        occupiedRects: [],
        template
      })
    ).toEqual({ x: 340, y: 340 })
  })

  it('moves the complete template to the nearest available position without changing layout', () => {
    const template = createWorkflowTemplate()
    const desiredCenter = { x: 500, y: 400 }
    const desiredRects = projectBlockTemplateRects(template, { x: 340, y: 340 })
    const origin = resolveBlockTemplatePlacement({
      desiredCenter,
      occupiedRects: [
        {
          id: 'existing',
          position: { x: 320, y: 320 },
          size: { width: 220, height: 160 }
        }
      ],
      template
    })
    const placedRects = projectBlockTemplateRects(template, origin)

    expect(origin).not.toEqual({ x: 340, y: 340 })
    expect(placedRects[1].position.x - placedRects[0].position.x).toBe(
      desiredRects[1].position.x - desiredRects[0].position.x
    )
    expect(placedRects[1].position.y - placedRects[0].position.y).toBe(
      desiredRects[1].position.y - desiredRects[0].position.y
    )
    expect(
      placedRects.every(
        (rect) =>
          !overlaps(rect, {
            position: { x: 320, y: 320 },
            size: { width: 220, height: 160 }
          })
      )
    ).toBe(true)
  })

  it('uses the complete combination boundary as one unchanged collision footprint', () => {
    const template: BlockTemplateSnapshot = {
      ...createWorkflowTemplate(),
      type: 'combination',
      id: 'combination-template'
    }
    const origin = resolveBlockTemplatePlacement({
      desiredCenter: { x: 500, y: 400 },
      occupiedRects: [
        {
          id: 'existing',
          position: { x: 300, y: 260 },
          size: { width: 540, height: 20 }
        }
      ],
      template
    })
    const footprint = projectBlockTemplateRects(template, origin)

    expect(footprint).toHaveLength(1)
    expect(footprint[0].size).toEqual({ width: 520, height: 320 })
    expect(
      overlaps(footprint[0], {
        position: { x: 300, y: 260 },
        size: { width: 540, height: 20 }
      })
    ).toBe(false)
  })
})

function createWorkflowTemplate(): BlockTemplateSnapshot {
  return {
    id: 'workflow-template',
    type: 'workflow',
    name: 'Build',
    description: '',
    scope: { type: 'global' },
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    nodes: [
      {
        templateNodeId: 'node-a',
        name: 'A',
        description: '',
        launchCommand: 'pnpm a',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        position: { x: 0, y: 0 },
        size: { width: 120, height: 120 }
      },
      {
        templateNodeId: 'node-b',
        name: 'B',
        description: '',
        launchCommand: 'pnpm b',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        position: { x: 200, y: 0 },
        size: { width: 120, height: 120 }
      }
    ],
    connections: [{ sourceTemplateNodeId: 'node-a', targetTemplateNodeId: 'node-b' }]
  }
}

function overlaps(
  left: {
    readonly position: { readonly x: number; readonly y: number }
    readonly size: { readonly width: number; readonly height: number }
  },
  right: {
    readonly position: { readonly x: number; readonly y: number }
    readonly size: { readonly width: number; readonly height: number }
  }
): boolean {
  return !(
    left.position.x + left.size.width <= right.position.x ||
    right.position.x + right.size.width <= left.position.x ||
    left.position.y + left.size.height <= right.position.y ||
    right.position.y + right.size.height <= left.position.y
  )
}
