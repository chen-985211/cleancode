import { useLayoutEffect } from 'react'
import type { TerminalRenderingWorkloadCoordinator } from './terminalRenderingWorkloadCoordinator'

// Keep disclosure/reflow in the same workload policy as canvas and sidebar gestures.
// A reversal or another member's animation must not release the shared interaction.
export function useTerminalObjectMotionWorkload(
  nodes: readonly {
    readonly data: {
      readonly objectMotion?: { readonly id: string }
      readonly isObjectMotionFrozen?: boolean
    }
  }[],
  coordinator?: Partial<Pick<TerminalRenderingWorkloadCoordinator, 'setObjectMotionActive'>>
): void {
  const active = nodes.some(({ data }) => data.objectMotion && !data.isObjectMotionFrozen)
  useLayoutEffect(() => {
    if (!active) return
    coordinator?.setObjectMotionActive?.(true)
    return () => coordinator?.setObjectMotionActive?.(false)
  }, [active, coordinator])
}
