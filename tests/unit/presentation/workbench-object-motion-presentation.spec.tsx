import { act, renderHook } from '@testing-library/react'
import type { AnimationEvent, CSSProperties } from 'react'

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

  it('projects group offsets as CSS variables and reports the completed exit identity', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useWorkbenchObjectMotionPresentation(
        createMotion('group-collapse', { x: -320, y: -170 }),
        onComplete
      )
    )

    expect(result.current.className).toBe('workbench-object-motion--group-collapse')
    expect(readCustomProperty(result.current.style, '--workbench-object-motion-x')).toBe('-320px')
    expect(readCustomProperty(result.current.style, '--workbench-object-motion-y')).toBe('-170px')

    act(() => result.current.onAnimationEnd(createAnimationEvent(false)))

    expect(onComplete).toHaveBeenCalledWith('motion-1')
    expect(result.current.className).toBe('')
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

function readCustomProperty(style: CSSProperties | undefined, property: string): unknown {
  return (style as Record<string, unknown> | undefined)?.[property]
}
