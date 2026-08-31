import { fireEvent, render, screen } from '@testing-library/react'
import { useCallback, useRef, useState } from 'react'

import { useOutsidePointerDismiss } from '../../../../src/presentation/shared/hooks/useOutsidePointerDismiss'

describe('outside pointer dismiss', () => {
  it('commits the closing state before passing the pointer to its target', () => {
    const order: string[] = []

    render(<DismissHarness onEvent={(event) => order.push(event)} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '画布目标' }))

    expect(order).toEqual(['dismiss', 'target:closed'])
    expect(screen.getByTestId('surface-state')).toHaveTextContent('closed')
  })

  it('keeps inside pointers within the active surface', () => {
    const onEvent = vi.fn()

    render(<DismissHarness onEvent={onEvent} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '浮层内容' }))

    expect(onEvent).not.toHaveBeenCalled()
    expect(screen.getByTestId('surface-state')).toHaveTextContent('open')
  })

  it('can own the complete outside pointer sequence without leaking it to the canvas', () => {
    vi.useFakeTimers()
    const onEvent = vi.fn()

    try {
      render(<DismissHarness onEvent={onEvent} pointerPolicy="consume" />)

      const canvasTarget = screen.getByRole('button', { name: '画布目标' })
      fireEvent.pointerDown(canvasTarget, { button: 0, pointerId: 7 })
      fireEvent.mouseDown(canvasTarget, { button: 0 })
      fireEvent.pointerUp(canvasTarget, { button: 0, pointerId: 7 })
      fireEvent.mouseUp(canvasTarget, { button: 0 })
      fireEvent.click(canvasTarget, { button: 0 })

      expect(onEvent).toHaveBeenCalledTimes(1)
      expect(onEvent).toHaveBeenCalledWith('dismiss')
      expect(screen.getByTestId('surface-state')).toHaveTextContent('closed')

      vi.runOnlyPendingTimers()
      fireEvent.pointerDown(canvasTarget, { button: 0, pointerId: 8 })
      expect(onEvent).toHaveBeenLastCalledWith('target:closed')
    } finally {
      vi.useRealTimers()
    }
  })
})

function DismissHarness({
  onEvent,
  pointerPolicy = 'passthrough'
}: {
  readonly onEvent: (event: string) => void
  readonly pointerPolicy?: 'consume' | 'passthrough'
}) {
  const [isOpen, setIsOpen] = useState(true)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const isInside = useCallback(
    (target: Node): boolean => surfaceRef.current?.contains(target) ?? false,
    []
  )

  useOutsidePointerDismiss({
    active: isOpen,
    isInside,
    onDismiss: () => {
      onEvent('dismiss')
      setIsOpen(false)
    },
    pointerPolicy
  })

  return (
    <div>
      <output data-testid="surface-state">{isOpen ? 'open' : 'closed'}</output>
      <div ref={surfaceRef}>
        <button type="button">浮层内容</button>
      </div>
      <button
        type="button"
        onPointerDown={() => {
          onEvent(`target:${isOpen ? 'open' : 'closed'}`)
        }}
      >
        画布目标
      </button>
    </div>
  )
}
