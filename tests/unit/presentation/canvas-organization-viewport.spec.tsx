import { act, fireEvent, renderHook } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import {
  useCanvasOrganization,
  type OrganizeCanvasHandler
} from '../../../src/presentation/app-shell/workbench/viewport/useCanvasOrganization'

const geometry = vi.hoisted(() => ({
  canvasSize: { width: 1_200, height: 800 },
  safeViewport: { x: 24, y: 120, width: 1_152, height: 640 }
}))
vi.mock(
  '../../../src/presentation/app-shell/workbench/viewport/workbenchCanvasSafeViewport',
  () => ({
    readWorkbenchCanvasCreationGeometry: () => geometry
  })
)

const bounds = { x: -500, y: -350, width: 1_000, height: 700 }

describe('canvas organization viewport', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([0.35, 0.72, 1, 1.6])(
    'fits the committed layout in the safe viewport from zoom %s',
    async (zoom) => {
      const hook = renderOrganization({ zoom })
      await act(() => hook.result.current.organize())
      const viewport = hook.setViewport.mock.calls.at(-1)![0]
      const safe = geometry.safeViewport
      expect(viewport.x + (bounds.x + bounds.width / 2) * viewport.zoom).toBeCloseTo(
        safe.x + safe.width / 2
      )
      expect(viewport.y + (bounds.y + bounds.height / 2) * viewport.zoom).toBeCloseTo(
        safe.y + safe.height / 2
      )
      expect(viewport.x + bounds.x * viewport.zoom).toBeGreaterThanOrEqual(safe.x)
      expect(viewport.y + bounds.y * viewport.zoom).toBeGreaterThanOrEqual(safe.y)
      expect(viewport.x + (bounds.x + bounds.width) * viewport.zoom).toBeLessThanOrEqual(
        safe.x + safe.width
      )
      expect(viewport.y + (bounds.y + bounds.height) * viewport.zoom).toBeLessThanOrEqual(
        safe.y + safe.height
      )
      expect(viewport.zoom).toBeLessThanOrEqual(1)
      expect(hook.onFailure).not.toHaveBeenCalled()
    }
  )

  it.each([
    'workspace switch',
    'manual navigation',
    'keyboard navigation',
    'pointer navigation',
    'wheel navigation',
    'unmount'
  ] as const)('does not apply a late viewport after %s', async (event) => {
    let complete!: (result: typeof bounds) => void
    const onOrganizeCanvas = vi.fn(
      () =>
        new Promise<typeof bounds>((resolve) => {
          complete = resolve
        })
    )
    const hook = renderOrganization({ onOrganizeCanvas })
    let pending!: Promise<void>
    act(() => {
      pending = hook.result.current.organize()
    })
    expect(hook.setViewport).not.toHaveBeenCalled()
    if (event === 'workspace switch') hook.rerender({ scopeKey: 'another-workspace' })
    else if (event === 'unmount') hook.unmount()
    else if (event === 'keyboard navigation') fireEvent.keyDown(document, { key: 'ArrowRight' })
    else if (event === 'pointer navigation') fireEvent.pointerDown(document)
    else if (event === 'wheel navigation') fireEvent.wheel(document, { deltaY: 100 })
    else act(() => hook.result.current.cancelFocus())
    await act(async () => {
      complete(bounds)
      await pending
    })
    expect(hook.setViewport).not.toHaveBeenCalled()
    expect(hook.onFailure).not.toHaveBeenCalled()
  })

  it('keeps the current viewport when committing positions fails', async () => {
    const hook = renderOrganization({ onOrganizeCanvas: async () => null })
    await act(() => hook.result.current.organize())
    expect(hook.setViewport).not.toHaveBeenCalled()
    expect(hook.onFailure).not.toHaveBeenCalled()
  })

  it('centers oversized content at the existing minimum zoom', async () => {
    const hook = renderOrganization({
      onOrganizeCanvas: async () => ({ x: -10_000, y: -8_000, width: 20_000, height: 16_000 })
    })
    await act(() => hook.result.current.organize())
    expect(hook.setViewport.mock.calls.at(-1)?.[0]).toEqual({ x: 600, y: 440, zoom: 0.35 })
  })
})

function renderOrganization({
  zoom = 1,
  onOrganizeCanvas = async () => bounds
}: {
  readonly zoom?: number
  readonly onOrganizeCanvas?: OrganizeCanvasHandler
} = {}) {
  const setViewport = vi.fn<(viewport: { x: number; y: number; zoom: number }) => Promise<boolean>>(
    async () => true
  )
  const instance = {
    getViewport: () => ({ x: -2_000, y: 3_000, zoom }),
    setViewport
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
  const onFailure = vi.fn()
  const hook = renderHook(
    ({ scopeKey }) =>
      useCanvasOrganization({
        scopeKey,
        onOrganizeCanvas,
        onFailure,
        reactFlowInstanceRef: { current: instance },
        items: [
          {
            key: 'agent:a',
            nodeIds: ['agent:a'],
            reference: { kind: 'agent', agentId: 'a' },
            position: { x: 0, y: 0 },
            size: { width: 720, height: 460 }
          }
        ]
      }),
    { initialProps: { scopeKey: 'workspace' } }
  )
  return { ...hook, setViewport, onFailure }
}
