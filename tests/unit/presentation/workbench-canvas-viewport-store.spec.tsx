import { act, render, screen } from '@testing-library/react'

import {
  createWorkbenchCanvasViewportStore,
  useWorkbenchCanvasDetailLevel
} from '../../../src/presentation/app-shell/workbenchCanvasViewportStore'

describe('workbench canvas viewport store', () => {
  it('publishes only changed presentation values', () => {
    const initialViewport = { x: 0, y: 0, zoom: 1 }
    const store = createWorkbenchCanvasViewportStore(initialViewport)
    const listener = vi.fn()

    store.subscribe(listener)
    store.setViewport({ x: 0, y: 0, zoom: 1 })

    expect(listener).not.toHaveBeenCalled()
    expect(store.getViewport()).toBe(initialViewport)

    store.setViewport({ x: -120, y: 48, zoom: 0.92 })

    expect(listener).toHaveBeenCalledOnce()
    expect(store.getViewport()).toEqual({ x: -120, y: 48, zoom: 0.92 })
  })

  it('rerenders the canvas detail consumer only when zoom crosses a detail threshold', () => {
    const store = createWorkbenchCanvasViewportStore({ x: 0, y: 0, zoom: 1 })
    let renderCount = 0

    function DetailLevelProbe() {
      renderCount += 1
      const detailLevel = useWorkbenchCanvasDetailLevel(store, true)

      return <output aria-label="detail level">{detailLevel}</output>
    }

    render(<DetailLevelProbe />)
    const initialRenderCount = renderCount

    act(() => {
      store.setViewport({ x: -80, y: 40, zoom: 0.96 })
      store.setViewport({ x: -160, y: 80, zoom: 0.9 })
    })

    expect(renderCount).toBe(initialRenderCount)
    expect(screen.getByLabelText('detail level')).toHaveTextContent('full')

    act(() => {
      store.setViewport({ x: -240, y: 120, zoom: 0.72 })
    })

    expect(renderCount).toBe(initialRenderCount + 1)
    expect(screen.getByLabelText('detail level')).toHaveTextContent('compact')

    act(() => {
      store.setViewport({ x: -320, y: 160, zoom: 0.62 })
    })

    expect(renderCount).toBe(initialRenderCount + 1)

    act(() => {
      store.setViewport({ x: -400, y: 200, zoom: 0.48 })
    })

    expect(renderCount).toBe(initialRenderCount + 2)
    expect(screen.getByLabelText('detail level')).toHaveTextContent('overview')
  })
})
