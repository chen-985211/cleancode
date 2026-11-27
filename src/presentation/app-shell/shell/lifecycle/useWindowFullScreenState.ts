import { useEffect, useState } from 'react'

export function useWindowFullScreenState(): boolean {
  return useNativeWindowState(
    false,
    window.cleancode?.getWindowFullScreenState,
    window.cleancode?.onWindowFullScreenStateChange
  )
}

export function useNativeWindowState<T>(
  initialValue: T,
  read: (() => Promise<T>) | undefined,
  subscribe: ((listener: (value: T) => void) => () => void) | undefined
): T {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (!read || !subscribe) return

    let disposed = false
    let receivedChangeEvent = false
    const unsubscribe = subscribe((next) => {
      if (disposed) return

      receivedChangeEvent = true
      setValue(next)
    })

    void read()
      .then((initial) => {
        if (disposed || receivedChangeEvent) return

        setValue(initial)
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [read, subscribe])

  return value
}
