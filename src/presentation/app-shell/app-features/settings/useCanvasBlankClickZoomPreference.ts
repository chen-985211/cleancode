import { useCallback, useState } from 'react'

import {
  readCanvasBlankClickZoomPreference,
  writeCanvasBlankClickZoomPreference
} from './canvasBlankClickZoomPreference'

export function useCanvasBlankClickZoomPreference() {
  const [zoomOnBlankClick, setZoomOnBlankClick] = useState(readCanvasBlankClickZoomPreference)
  const changeZoomOnBlankClick = useCallback((enabled: boolean) => {
    try {
      writeCanvasBlankClickZoomPreference(enabled)
    } catch {
      // Like other canvas preferences, storage is best effort for this session.
    }
    setZoomOnBlankClick(enabled)
  }, [])
  return { zoomOnBlankClick, changeZoomOnBlankClick }
}
