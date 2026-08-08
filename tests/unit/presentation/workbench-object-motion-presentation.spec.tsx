import { act, renderHook } from '@testing-library/react'
import type { AnimationEvent } from 'react'

import type { WorkbenchObjectMotion } from '../../../src/presentation/app-shell/types'
import { useWorkbenchObjectMotionPresentation } from '../../../src/presentation/app-shell/useWorkbenchObjectMotionPresentation'

describe('workbench object motion presentation', () => {
  it('keeps a creation presentation alive when graph projection data refreshes mid-animation', () => {
    const initialProps: { readonly motion?: WorkbenchObjectMotion } = {
      motion: createMotion('create')
    }
    const { result, rerender } = renderHook(
      ({ motion }: { readonly motion?: WorkbenchObjectMotion }) =>
        useWorkbenchObjectMotionPresentation(motion),
      { initialProps }
    )

    expect(result.current.className).toBe('workbench-object-motion--create')

    rerender({ motion: undefined })

    expect(result.current.className).toBe('workbench-object-motion--create')

    act(() => result.current.onAnimationEnd(createAnimationEvent(false)))

    expect(result.current.className).toBe('')
  })

  it('exposes a spring surface for group motion without projecting a fixed CSS endpoint', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useWorkbenchObjectMotionPresentation(
        createMotion('group-collapse', { x: -320, y: -170 }),
        onComplete
      )
    )

    expect(result.current.className).toBe(
      'workbench-object-motion--group-collapse workbench-object-motion--spatial'
    )
    expect(result.current.surfaceRef).toEqual(expect.any(Function))
    expect(result.current.style).toBeUndefined()

    act(() => result.current.onAnimationEnd(createAnimationEvent(false)))

    expect(onComplete).not.toHaveBeenCalled()
    expect(result.current.className).toBe(
      'workbench-object-motion--group-collapse workbench-object-motion--spatial'
    )
  })

  it('ignores animation events from nested terminal content', () => {
    const { result } = renderHook(() =>
      useWorkbenchObjectMotionPresentation(createMotion('create'))
    )

    act(() => result.current.onAnimationEnd(createAnimationEvent(true)))

    expect(result.current.className).toBe('workbench-object-motion--create')
  })
})

function createMotion(
  kind: WorkbenchObjectMotion['kind'],
  offset = { x: 0, y: 0 }
): WorkbenchObjectMotion {
  return { id: 'motion-1', kind, offset }
}

function createAnimationEvent(nested: boolean): AnimationEvent<HTMLElement> {
  const currentTarget = document.createElement('div')
  return {
    currentTarget,
    target: nested ? document.createElement('span') : currentTarget
  } as unknown as AnimationEvent<HTMLElement>
}
