import { useLayoutEffect, useRef } from 'react'

// The graph retains the exiting shell. Keep the same committed terminal view
// attached to it until the shell unmounts, even if its runtime has gone away.
export function useWorkbenchNodeExitView<T>(live: T, exiting: boolean): T {
  const displayed = useRef(live)
  useLayoutEffect(() => {
    if (!exiting) displayed.current = live
  }, [live, exiting])
  return exiting ? displayed.current : live
}
