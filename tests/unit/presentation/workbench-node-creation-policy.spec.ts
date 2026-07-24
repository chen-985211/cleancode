import {
  resolveWorkbenchNodeCreationPlan,
  resolveWorkbenchNodeCreationViewport,
  workbenchNodePlacementGap,
  type WorkbenchCanvasRect
} from '../../../src/presentation/app-shell/workbenchNodeCreationPolicy'

describe('workbench node creation policy', () => {
  const canvasSize = { width: 1_200, height: 800 }
  const safeViewport = { x: 24, y: 184, width: 1_152, height: 592 }
  const candidateSize = { width: 720, height: 460 }

  it.each([0.35, 0.6, 1, 1.6])(
    'converges to the same result state from an initial zoom of %s',
    (initialZoom) => {
      const visibleCanvasCenter = { x: 1_400, y: 900 }
      const safeCenter = centerOf(safeViewport)
      const plan = resolveWorkbenchNodeCreationPlan({
        canvasSize,
        currentViewport: {
          x: safeCenter.x - visibleCanvasCenter.x * initialZoom,
          y: safeCenter.y - visibleCanvasCenter.y * initialZoom,
          zoom: initialZoom
        },
        nodeSize: candidateSize,
        occupiedRects: [],
        safeViewport
      })

      expect(plan.position.x).toBeCloseTo(1_040)
      expect(plan.position.y).toBeCloseTo(670)
      expectNodeToBeContainedBy(
        projectNodeRect(plan.position, candidateSize, plan.viewport),
        safeViewport
      )
    }
  )

  it('uses every visible node kind as one occupancy set and keeps a uniform gap', () => {
    const occupiedRects: WorkbenchCanvasRect[] = [
      {
        id: 'terminal-1',
        position: { x: 164, y: 250 },
        size: candidateSize
      },
      {
        id: 'group-1',
        position: { x: 948, y: 250 },
        size: { width: 900, height: 540 }
      },
      {
        id: 'agent:agent-1',
        position: { x: -620, y: 250 },
        size: candidateSize
      }
    ]

    const plan = resolveWorkbenchNodeCreationPlan({
      canvasSize,
      currentViewport: { x: 0, y: 0, zoom: 1 },
      nodeSize: candidateSize,
      occupiedRects,
      safeViewport
    })
    const createdRect = { id: 'created', position: plan.position, size: candidateSize }

    expect(occupiedRects.every((occupied) => hasGap(createdRect, occupied))).toBe(true)
    expect(
      resolveWorkbenchNodeCreationPlan({
        canvasSize,
        currentViewport: { x: 0, y: 0, zoom: 1 },
        nodeSize: candidateSize,
        occupiedRects: [...occupiedRects].reverse(),
        safeViewport
      }).position
    ).toEqual(plan.position)
  })

  it('chooses the nearest obstacle edge instead of jumping by a whole node-sized grid cell', () => {
    const plan = resolveWorkbenchNodeCreationPlan({
      canvasSize: { width: 1_000, height: 1_000 },
      currentViewport: { x: 0, y: 0, zoom: 1 },
      nodeSize: { width: 100, height: 100 },
      occupiedRects: [
        {
          id: 'center-obstacle',
          position: { x: 475, y: 475 },
          size: { width: 50, height: 50 }
        }
      ],
      safeViewport: { x: 0, y: 0, width: 1_000, height: 1_000 }
    })

    expect(plan.position).toEqual({ x: 589, y: 450 })
  })

  it.each([
    {
      name: 'minimum supported window with expanded canvas chrome',
      canvasSize: { width: 740, height: 612 },
      safeViewport: { x: 24, y: 188, width: 692, height: 400 }
    },
    {
      name: 'wide window with collapsed minimap',
      canvasSize: { width: 1_680, height: 980 },
      safeViewport: { x: 24, y: 112, width: 1_632, height: 844 }
    }
  ])('fully reveals a created node in the $name', ({ canvasSize, safeViewport }) => {
    const position = { x: 2_400, y: -360 }
    const viewport = resolveWorkbenchNodeCreationViewport({
      canvasSize,
      nodePosition: position,
      nodeSize: candidateSize,
      safeViewport
    })

    expectNodeToBeContainedBy(projectNodeRect(position, candidateSize, viewport), safeViewport)
    expect(viewport.zoom).toBeLessThanOrEqual(1)
  })
})

interface ScreenRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

function expectNodeToBeContainedBy(received: ScreenRect, container: ScreenRect): void {
  const epsilon = 0.001

  expect(received.x).toBeGreaterThanOrEqual(container.x - epsilon)
  expect(received.y).toBeGreaterThanOrEqual(container.y - epsilon)
  expect(received.x + received.width).toBeLessThanOrEqual(container.x + container.width + epsilon)
  expect(received.y + received.height).toBeLessThanOrEqual(container.y + container.height + epsilon)
}

function centerOf(rect: ScreenRect): { readonly x: number; readonly y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  }
}

function projectNodeRect(
  position: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  viewport: { readonly x: number; readonly y: number; readonly zoom: number }
): ScreenRect {
  return {
    x: viewport.x + position.x * viewport.zoom,
    y: viewport.y + position.y * viewport.zoom,
    width: size.width * viewport.zoom,
    height: size.height * viewport.zoom
  }
}

function hasGap(left: WorkbenchCanvasRect, right: WorkbenchCanvasRect): boolean {
  return (
    left.position.x + left.size.width + workbenchNodePlacementGap <= right.position.x ||
    right.position.x + right.size.width + workbenchNodePlacementGap <= left.position.x ||
    left.position.y + left.size.height + workbenchNodePlacementGap <= right.position.y ||
    right.position.y + right.size.height + workbenchNodePlacementGap <= left.position.y
  )
}
