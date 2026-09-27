import { act, fireEvent, render } from '@testing-library/react'
import { useMemo, useRef } from 'react'

import { useTerminalMetadataPlacement } from '../../../../src/contexts/block-graph/presentation/components/useTerminalMetadataPlacement'

let viewport = { x: 280, y: 120, width: 900, height: 620 }
let parent = { x: 400, y: 500 }
let zoom = 1
let height = 700

function Harness({ open }: { readonly open: boolean }) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const positionerRef = useRef<HTMLDivElement>(null)
  const environment = useMemo(() => ({ anchorRef, readViewport: () => viewport }), [])
  useTerminalMetadataPlacement(open, positionerRef, environment)
  return (
    <div data-parent="">
      <button ref={anchorRef}>Edit</button>
      <div ref={positionerRef} data-positioner="">
        <div>Editor</div>
      </div>
    </div>
  )
}

describe('terminal metadata placement measurement', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let resize: ResizeObserverCallback
  let disconnect: ReturnType<typeof vi.fn>

  beforeEach(() => {
    viewport = { x: 280, y: 120, width: 900, height: 620 }
    parent = { x: 400, y: 500 }
    zoom = 1
    height = 700
    frames.clear()
    let nextFrame = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id))
    disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback
        }
        observe = vi.fn()
        disconnect = disconnect
      }
    )
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.hasAttribute('data-positioner') ? document.querySelector('[data-parent]') : null
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.hasAttribute('data-parent') ? 720 : 460
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height)
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockReturnValue(252)
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(52)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.hasAttribute('data-parent')
        ? new DOMRect(parent.x, parent.y, 720 * zoom, 360 * zoom)
        : new DOMRect(parent.x + 650 * zoom, parent.y + 8 * zoom, 32 * zoom, 32 * zoom)
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  const flush = () =>
    act(() => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((callback) => callback(0))
    })

  function expectVisible(positioner: HTMLElement) {
    const [dx, dy, scale] = positioner.style.transform
      .match(/-?\d*\.?\d+(?:e[+-]?\d+)?/g)!
      .map(Number)
    const left = parent.x + (252 + dx!) * zoom
    const top = parent.y + (52 + dy!) * zoom
    expect(left).toBeGreaterThanOrEqual(viewport.x - 0.001)
    expect(top).toBeGreaterThanOrEqual(viewport.y - 0.001)
    expect(left + 460 * zoom * scale!).toBeLessThanOrEqual(viewport.x + viewport.width + 0.001)
    expect(top + height * zoom * scale!).toBeLessThanOrEqual(viewport.y + viewport.height + 0.001)
  }

  it('remeasures content growth, window changes and transformed canvas ancestors', async () => {
    const view = render(<Harness open />)
    const positioner = view.container.querySelector<HTMLElement>('[data-positioner]')!
    expectVisible(positioner)
    height = 1100
    act(() => resize([], {} as ResizeObserver))
    flush()
    expectVisible(positioner)
    viewport = { x: 280, y: 140, width: 600, height: 400 }
    fireEvent.resize(window)
    flush()
    expectVisible(positioner)
    await act(async () => {
      zoom = 0.5
      parent.y = 800
      view.container.querySelector<HTMLElement>('[data-parent]')!.style.transform = 'scale(0.5)'
    })
    flush()
    expectVisible(positioner)
  })

  it('freezes exit placement and cleans pending observers and frames when closed', () => {
    const view = render(<Harness open />)
    const positioner = view.container.querySelector<HTMLElement>('[data-positioner]')!
    const before = positioner.style.transform
    fireEvent.resize(window)
    expect(frames.size).toBe(1)
    view.rerender(<Harness open={false} />)
    expect(frames.size).toBe(0)
    expect(disconnect).toHaveBeenCalledOnce()
    fireEvent.resize(window)
    expect(frames.size).toBe(0)
    expect(positioner.style.transform).toBe(before)
    view.rerender(<Harness open />)
    expectVisible(positioner)
    fireEvent.resize(window)
    view.unmount()
    expect(frames.size).toBe(0)
    expect(disconnect).toHaveBeenCalledTimes(2)
  })
})
