import { useEffect, useState } from 'react'

export function useWindowFullScreenState(): boolean {
  const [isFullScreen, setIsFullScreen] = useState(false)

  useEffect(() => {
    const api = window.cleancode
    if (!api?.getWindowFullScreenState || !api.onWindowFullScreenStateChange) return

    let disposed = false
    let receivedChangeEvent = false
    const unsubscribe = api.onWindowFullScreenStateChange((nextIsFullScreen) => {
      if (disposed) return

      receivedChangeEvent = true
      setIsFullScreen(nextIsFullScreen)
    })

    void api
      .getWindowFullScreenState()
      .then((initialIsFullScreen) => {
        if (disposed || receivedChangeEvent) return

        setIsFullScreen(initialIsFullScreen)
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  return isFullScreen
}
