import { useEffect, useState } from 'react'

export function useWindowFullScreenState(): boolean {
  return useNativeWindowFlag(
    window.cleancode?.getWindowFullScreenState,
    window.cleancode?.onWindowFullScreenStateChange
  )
}

export function useNativeWindowFlag(
  read: (() => Promise<boolean>) | undefined,
  subscribe: ((listener: (value: boolean) => void) => () => void) | undefined
): boolean {
  const [value, setValue] = useState(false)

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
