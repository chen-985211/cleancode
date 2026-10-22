import { renderHook } from '@testing-library/react'
import { useTerminalObjectMotionWorkload } from '../../../src/presentation/app-shell/context-adapters/run/useTerminalObjectMotionWorkload'

describe('terminal object motion workload', () => {
  it('holds the workload until all motions finish, including reversals, and releases on unmount', () => {
    const coordinator = { setObjectMotionActive: vi.fn() }
    const node = (id?: string, frozen = false) => ({
      data: {
        objectMotion: id ? { id } : undefined,
        isObjectMotionFrozen: frozen
      }
    })
    const { rerender, unmount } = renderHook(
      ({ nodes }) => useTerminalObjectMotionWorkload(nodes, coordinator),
      { initialProps: { nodes: [node('expand-1'), node('expand-2')] } }
    )
    expect(coordinator.setObjectMotionActive.mock.calls).toEqual([[true]])
    rerender({ nodes: [node(), node('collapse-2')] })
    expect(coordinator.setObjectMotionActive.mock.calls).toEqual([[true]])
    rerender({ nodes: [node(), node('collapse-2', true)] })
    expect(coordinator.setObjectMotionActive.mock.calls).toEqual([[true], [false]])
    rerender({ nodes: [node('expand-3')] })
    unmount()
    expect(coordinator.setObjectMotionActive.mock.calls).toEqual([[true], [false], [true], [false]])
  })
})
