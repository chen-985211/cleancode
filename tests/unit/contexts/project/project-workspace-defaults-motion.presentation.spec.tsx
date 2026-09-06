import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { WorkspaceDefaultsRows } from '../../../../src/contexts/project/presentation/components/WorkspaceDefaultsMotion'
import { motionPreferenceStore } from '../../../../src/presentation/shared/motion/motionPreference'

describe('workspace default rows motion', () => {
  let time: number
  let frames: Map<number, FrameRequestCallback>
  beforeEach(() => {
    time = 0
    frames = new Map()
    let nextId = 0
    vi.spyOn(window.performance, 'now').mockImplementation(() => time)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextId, callback)
      return nextId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 66
    } as DOMRect)
    vi.spyOn(motionPreferenceStore, 'getSnapshot').mockReturnValue(false)
  })
  afterEach(() => vi.restoreAllMocks())
  function advance(milliseconds: number) {
    act(() => {
      time += milliseconds
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(time))
    })
  }
  const rows = [{ id: 'agent', content: <button>Agent</button> }]
  it.each([false, true])(
    'shows existing rows at their final height on entry (StrictMode: %s)',
    (strict) => {
      const view = <WorkspaceDefaultsRows rows={rows} />
      render(strict ? <StrictMode>{view}</StrictMode> : view)
      const row = screen
        .getByRole('button')
        .closest('.workspace-defaults-row-motion') as HTMLElement
      expect(row.style.height).toBe('auto')
      expect(row.style.opacity).toBe('1')
      expect(row.style.transform).toBe('translateY(0px)')
      expect(frames.size).toBe(0)
    }
  )
  it.each([false, true])(
    'keeps user-driven removal and reversal continuous (StrictMode: %s)',
    (strict) => {
      const view = (items: typeof rows) =>
        strict ? (
          <StrictMode>
            <WorkspaceDefaultsRows rows={items} />
          </StrictMode>
        ) : (
          <WorkspaceDefaultsRows rows={items} />
        )
      const { rerender, unmount } = render(view(rows))
      const row = screen
        .getByRole('button')
        .closest('.workspace-defaults-row-motion') as HTMLElement
      rerender(view([]))
      expect(row).toHaveAttribute('inert')
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      advance(60)
      const height = parseFloat(row.style.height)
      expect(height).toBeGreaterThan(0)
      expect(height).toBeLessThan(66)
      rerender(view(rows))
      expect(screen.getAllByRole('button')).toHaveLength(1)
      expect(parseFloat(row.style.height)).toBeCloseTo(height)
      advance(16)
      expect(parseFloat(row.style.height)).toBeGreaterThan(height)
      unmount()
      expect(frames.size).toBe(0)
    }
  )
  it('finishes a pending removal immediately when reduced motion is enabled', () => {
    const { rerender } = render(<WorkspaceDefaultsRows rows={rows} />)
    rerender(<WorkspaceDefaultsRows rows={[]} />)
    advance(50)
    vi.mocked(motionPreferenceStore.getSnapshot).mockReturnValue(true)
    rerender(<WorkspaceDefaultsRows rows={[]} />)
    expect(screen.queryByText('Agent')).not.toBeInTheDocument()
    expect(frames.size).toBe(0)
  })
})
