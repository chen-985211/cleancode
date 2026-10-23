import { render } from '@testing-library/react'

import { CanvasStatusbarGlass } from '../../../src/presentation/app-shell/workbench/CanvasStatusbarGlass'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('canvas statusbar glass surface', () => {
  it('never exposes an empty resource URL while the lens map is being measured', () => {
    const { container } = render(<CanvasStatusbarGlass />)
    const href = container.querySelector('feImage')?.getAttribute('href')

    expect(href).toBeTruthy()
    expect(() => new URL(href!)).not.toThrow()
  })

  it('releases resize observation and cancels a pending lens update on unmount', () => {
    const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }
    let resize: ResizeObserverCallback = () => undefined
    vi.stubGlobal('CSS', { supports: () => true })
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function (callback: ResizeObserverCallback) {
        resize = callback
        return observer
      })
    )
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(17)
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame')

    const { unmount } = render(<CanvasStatusbarGlass />)
    resize([], observer)
    unmount()

    expect(observer.disconnect).toHaveBeenCalledOnce()
    expect(cancelFrame).toHaveBeenCalledWith(17)
  })
})
