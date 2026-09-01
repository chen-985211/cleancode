import { act, fireEvent, render } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useRef } from 'react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import {
  resolveWorkbenchWheelZoomStops,
  useWorkbenchDirectZoom
} from '../../../src/presentation/app-shell/useWorkbenchDirectZoom'
import * as directZoom from '../../../src/presentation/app-shell/workbenchDirectZoom'
import * as viewportMotion from '../../../src/presentation/app-shell/workbenchViewportMotion'

describe('workbench direct zoom input', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    { ctrlKey: false, deltaMode: WheelEvent.DOM_DELTA_PIXEL, deltaY: -100, mac: false, zoom: 0.2 },
    { ctrlKey: false, deltaMode: WheelEvent.DOM_DELTA_LINE, deltaY: -4, mac: false, zoom: 0.2 },
    { ctrlKey: false, deltaMode: WheelEvent.DOM_DELTA_PAGE, deltaY: -0.2, mac: false, zoom: 0.2 },
    { ctrlKey: true, deltaMode: WheelEvent.DOM_DELTA_PIXEL, deltaY: -10, mac: true, zoom: 0.2 }
  ])('normalizes wheel input into zoom stops: $deltaMode', (input) => {
    expect(resolveWorkbenchWheelZoomStops(input)).toBeCloseTo(input.zoom, 10)
  })

  it('captures pane wheel input once and leaves nowheel content in control', () => {
    const instance = createViewportInstance()
    const onViewportInteractionStart = vi.fn()
    const retarget = vi.spyOn(directZoom, 'retargetWorkbenchDirectZoom').mockReturnValue(true)
    const cancelProgrammatic = vi
      .spyOn(viewportMotion, 'cancelWorkbenchViewportMotion')
      .mockImplementation(() => undefined)
    const view = render(
      <DirectZoomHarness
        instance={instance}
        onViewportInteractionStart={onViewportInteractionStart}
      />
    )
    const pane = view.getByTestId('pane')
    const terminal = view.getByTestId('terminal')

    const paneEventAccepted = fireEvent.wheel(pane, {
      clientX: 140,
      clientY: 90,
      deltaMode: 0,
      deltaY: -100
    })
    fireEvent.wheel(terminal, { deltaMode: 0, deltaY: -100 })
    const terminalPinchAccepted = fireEvent.wheel(terminal, {
      ctrlKey: true,
      deltaMode: 0,
      deltaY: -10
    })

    expect(paneEventAccepted).toBe(false)
    expect(terminalPinchAccepted).toBe(false)
    expect(cancelProgrammatic).toHaveBeenCalledOnce()
    expect(retarget).toHaveBeenCalledOnce()
    expect(retarget).toHaveBeenCalledWith(instance, {
      anchor: { x: 120, y: 80 },
      deltaZoomStops: 0.2,
      reducedMotion: false
    })
    expect(onViewportInteractionStart).toHaveBeenCalledOnce()
  })

  it('settles both canvas motion owners when reduced motion changes at runtime', () => {
    const media = createMutableMediaQueryList(false)
    vi.spyOn(window, 'matchMedia').mockReturnValue(media.value)
    const instance = createViewportInstance()
    const settleDirectZoom = vi
      .spyOn(directZoom, 'setWorkbenchDirectZoomReducedMotion')
      .mockImplementation(() => undefined)
    const settleViewport = vi
      .spyOn(viewportMotion, 'setWorkbenchViewportReducedMotion')
      .mockImplementation(() => undefined)

    render(<DirectZoomHarness instance={instance} onViewportInteractionStart={vi.fn()} />)
    settleDirectZoom.mockClear()
    settleViewport.mockClear()

    act(() => media.setMatches(true))

    expect(settleDirectZoom).toHaveBeenCalledWith(true, instance)
    expect(settleViewport).toHaveBeenCalledWith(true, instance)
  })
})

function DirectZoomHarness({
  instance,
  onViewportInteractionStart
}: {
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly onViewportInteractionStart: () => void
}) {
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null)
  const reactFlowInstanceRef = useRef(instance)

  useWorkbenchDirectZoom({
    canvasSurfaceRef,
    onViewportInteractionStart,
    reactFlowInstanceRef,
    viewportMotionInstance: instance
  })

  return (
    <div ref={canvasSurfaceRef}>
      <div
        className="react-flow__renderer"
        ref={(element) => {
          if (!element) return
          element.getBoundingClientRect = () =>
            ({ left: 20, top: 10, width: 960, height: 640 }) as DOMRect
        }}
      >
        <div data-testid="pane" style={{ position: 'absolute', left: 140, top: 90 }} />
        <div className="nowheel" data-testid="terminal" />
      </div>
    </div>
  )
}

function createViewportInstance(): ReactFlowInstance<WorkbenchFlowNode, Edge> {
  return {
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport: vi.fn(async () => true)
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
}

function createMutableMediaQueryList(initialMatches: boolean) {
  let matches = initialMatches
  let listener: ((event: MediaQueryListEvent) => void) | null = null
  const value = {
    get matches() {
      return matches
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: (_type: string, nextListener: EventListenerOrEventListenerObject | null) => {
      if (typeof nextListener === 'function') {
        listener = nextListener as (event: MediaQueryListEvent) => void
      }
    },
    removeEventListener: () => {
      listener = null
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => true
  } as MediaQueryList
  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      listener?.({ matches, media: value.media } as MediaQueryListEvent)
    },
    value
  }
}
