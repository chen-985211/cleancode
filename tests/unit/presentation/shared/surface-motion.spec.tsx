import { act, fireEvent, render, screen } from '@testing-library/react'

import {
  AnchoredSurfaceMotion,
  OverlaySurfaceMotion,
  type SurfaceMotionPreferenceSource
} from '../../../../src/presentation/shared/components/SurfaceMotion'
import { useSurfaceMotionPresence } from '../../../../src/presentation/shared/hooks/useSurfaceMotionPresence'

describe('surface motion', () => {
  it('keeps one anchored DOM surface through close and reverse, then removes it after exit', () => {
    const onExitComplete = vi.fn()
    const { rerender } = render(
      <AnchoredSurfaceMotion aria-label="菜单" open={false} onExitComplete={onExitComplete} />
    )

    expect(screen.queryByLabelText('菜单')).not.toBeInTheDocument()

    rerender(<AnchoredSurfaceMotion aria-label="菜单" open onExitComplete={onExitComplete} />)
    const surface = screen.getByLabelText('菜单')
    expect(surface).toHaveAttribute('data-surface-motion-state', 'opening')
    expect(surface).not.toHaveAttribute('aria-hidden')
    expect(surface).not.toHaveAttribute('inert')

    fireEvent.transitionEnd(surface)
    expect(surface).toHaveAttribute('data-surface-motion-state', 'open')

    rerender(
      <AnchoredSurfaceMotion aria-label="菜单" open={false} onExitComplete={onExitComplete} />
    )
    expect(screen.getByLabelText('菜单', { selector: '[aria-hidden="true"]' })).toBe(surface)
    expect(surface).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(surface).toHaveAttribute('inert')

    rerender(<AnchoredSurfaceMotion aria-label="菜单" open onExitComplete={onExitComplete} />)
    expect(screen.getByLabelText('菜单')).toBe(surface)
    expect(surface).toHaveAttribute('data-surface-motion-state', 'opening')
    expect(surface).not.toHaveAttribute('inert')

    fireEvent.transitionEnd(surface)
    rerender(
      <AnchoredSurfaceMotion aria-label="菜单" open={false} onExitComplete={onExitComplete} />
    )
    fireEvent.transitionEnd(surface)

    expect(screen.queryByLabelText('菜单', { selector: '[aria-hidden="true"]' })).toBeNull()
    expect(onExitComplete).toHaveBeenCalledOnce()
  })

  it('ignores descendant motion completions', () => {
    render(
      <AnchoredSurfaceMotion aria-label="浮层" open>
        <span data-testid="child" />
      </AnchoredSurfaceMotion>
    )
    const surface = screen.getByLabelText('浮层')

    fireEvent.transitionEnd(screen.getByTestId('child'))

    expect(surface).toHaveAttribute('data-surface-motion-state', 'opening')
  })

  it('finishes an active exit immediately when the preference changes at runtime', () => {
    const preference = createMotionPreferenceSource(false)
    const onExitComplete = vi.fn()
    const { rerender } = render(
      <AnchoredSurfaceMotion
        aria-label="状态菜单"
        open
        motionPreference={preference}
        onExitComplete={onExitComplete}
      />
    )
    const surface = screen.getByLabelText('状态菜单')
    fireEvent.transitionEnd(surface)

    rerender(
      <AnchoredSurfaceMotion
        aria-label="状态菜单"
        open={false}
        motionPreference={preference}
        onExitComplete={onExitComplete}
      />
    )
    expect(surface).toHaveAttribute('data-surface-motion-state', 'closing')

    act(() => preference.setReducedMotion(true))

    expect(screen.queryByLabelText('状态菜单', { selector: '[aria-hidden="true"]' })).toBeNull()
    expect(onExitComplete).toHaveBeenCalledOnce()
  })

  it('keeps #root isolated while an overlay is open and releases on the final close intent', () => {
    const appRoot = document.createElement('div')
    appRoot.id = 'root'
    appRoot.setAttribute('aria-hidden', 'false')
    document.body.append(appRoot)

    const { rerender, unmount } = render(<OverlayHarness firstOpen secondOpen />, {
      container: appRoot
    })

    const first = screen.getByLabelText('第一层')
    const second = screen.getByLabelText('第二层')
    expect(appRoot).toHaveAttribute('aria-hidden', 'true')
    expect(appRoot.inert).toBe(true)
    expect(appRoot).not.toContainElement(first)
    expect(document.body).toContainElement(first)

    fireEvent.transitionEnd(first)
    fireEvent.transitionEnd(second)
    rerender(<OverlayHarness firstOpen={false} secondOpen />)
    fireEvent.transitionEnd(first)

    expect(screen.queryByLabelText('第一层', { selector: '[aria-hidden="true"]' })).toBeNull()
    expect(appRoot).toHaveAttribute('aria-hidden', 'true')
    expect(appRoot.inert).toBe(true)

    rerender(<OverlayHarness firstOpen={false} secondOpen={false} />)
    expect(appRoot).toHaveAttribute('aria-hidden', 'false')
    expect(appRoot.inert).toBe(false)
    fireEvent.transitionEnd(second)

    unmount()
    appRoot.remove()
  })

  it('exposes reusable presence props without rendering an opinionated element', () => {
    const { rerender } = render(<PresenceHarness open />)
    const surface = screen.getByLabelText('hook surface')

    expect(surface).toHaveAttribute('data-surface-motion-state', 'opening')
    fireEvent.transitionEnd(surface)
    expect(surface).toHaveAttribute('data-surface-motion-state', 'open')

    rerender(<PresenceHarness open={false} />)
    expect(surface).toHaveAttribute('aria-hidden', 'true')
    expect(surface).toHaveAttribute('inert')
  })
})

function OverlayHarness({
  firstOpen,
  secondOpen
}: {
  readonly firstOpen: boolean
  readonly secondOpen: boolean
}) {
  return (
    <>
      <OverlaySurfaceMotion aria-label="第一层" open={firstOpen} />
      <OverlaySurfaceMotion aria-label="第二层" open={secondOpen} />
    </>
  )
}

function PresenceHarness({ open }: { readonly open: boolean }) {
  const presence = useSurfaceMotionPresence(open)
  return presence.isPresent ? (
    <section aria-label="hook surface" {...presence.surfaceProps} />
  ) : null
}

function createMotionPreferenceSource(
  initialReducedMotion: boolean
): SurfaceMotionPreferenceSource & {
  setReducedMotion(reducedMotion: boolean): void
} {
  let reducedMotion = initialReducedMotion
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => reducedMotion,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setReducedMotion: (nextReducedMotion) => {
      reducedMotion = nextReducedMotion
      for (const listener of listeners) listener()
    }
  }
}
