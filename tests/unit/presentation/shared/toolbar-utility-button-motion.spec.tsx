import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'

import { useToolbarUtilityButtonMotion } from '../../../../src/presentation/shared/hooks/useToolbarUtilityButtonMotion'

describe('toolbar utility button motion', () => {
  it('responds on pointer down and springs back on release', () => {
    render(<MotionHarness />)
    const button = screen.getByRole('button', { name: '工具' })

    expect(button).toHaveStyle({
      '--toolbar-utility-motion-scale': '1',
      '--toolbar-utility-motion-y': '0px'
    })

    fireEvent.pointerDown(button, { button: 0, pointerType: 'mouse' })

    expect(button).toHaveAttribute('data-toolbar-utility-motion-state', 'closed')
    expect(readNumber(button, '--toolbar-utility-motion-scale')).toBeLessThan(1)
    expect(readNumber(button, '--toolbar-utility-motion-y')).toBeGreaterThan(0)

    fireEvent.pointerUp(button, { button: 0, pointerType: 'mouse' })

    expect(button).toHaveAttribute('data-toolbar-utility-motion-state', 'opening')
  })

  it('provides the same immediate feedback for keyboard activation', () => {
    render(<MotionHarness />)
    const button = screen.getByRole('button', { name: '工具' })

    fireEvent.keyDown(button, { key: ' ' })
    expect(readNumber(button, '--toolbar-utility-motion-scale')).toBeLessThan(1)

    fireEvent.keyUp(button, { key: ' ' })
    expect(button).toHaveAttribute('data-toolbar-utility-motion-state', 'opening')
  })

  it('ignores non-primary pointer buttons', () => {
    render(<MotionHarness />)
    const button = screen.getByRole('button', { name: '工具' })

    fireEvent.pointerDown(button, { button: 2, pointerType: 'mouse' })

    expect(button).toHaveAttribute('data-toolbar-utility-motion-state', 'open')
    expect(readNumber(button, '--toolbar-utility-motion-scale')).toBe(1)
  })

  it('settles an in-flight release before a costly surface redraw', () => {
    const { rerender } = render(<MotionHarness />)
    const button = screen.getByRole('button', { name: '工具' })

    fireEvent.pointerDown(button, { button: 0, pointerType: 'mouse' })
    fireEvent.pointerUp(button, { button: 0, pointerType: 'mouse' })
    expect(button).toHaveAttribute('data-toolbar-utility-motion-state', 'opening')

    rerender(<MotionHarness settleImmediately />)
    fireEvent.blur(button)

    expect(button).toHaveAttribute('data-toolbar-utility-motion-state', 'open')
    expect(readNumber(button, '--toolbar-utility-motion-scale')).toBe(1)
  })
})

function MotionHarness({ settleImmediately = false }: { readonly settleImmediately?: boolean }) {
  const rootRef = useRef<HTMLButtonElement | null>(null)
  const motionProps = useToolbarUtilityButtonMotion(rootRef, { settleImmediately })

  return (
    <button ref={rootRef} type="button" aria-label="工具" {...motionProps}>
      工具
    </button>
  )
}

function readNumber(element: HTMLElement, property: string): number {
  return Number.parseFloat(element.style.getPropertyValue(property))
}
