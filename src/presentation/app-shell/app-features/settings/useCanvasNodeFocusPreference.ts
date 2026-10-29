import { useCallback, useState } from 'react'
import {
  readCanvasNodeFocusPreference,
  writeCanvasNodeFocusPreference,
  type CanvasNodeFocusMode
} from './canvasNodeFocusPreference'

export function useCanvasNodeFocusPreference() {
  const [nodeFocusMode, setNodeFocusMode] = useState(readCanvasNodeFocusPreference)
  const changeNodeFocusMode = useCallback((mode: CanvasNodeFocusMode) => {
    try {
      writeCanvasNodeFocusPreference(mode)
    } catch {
      // Like other canvas preferences, storage is best effort for this session.
    }
    setNodeFocusMode(mode)
  }, [])
  return { nodeFocusMode, changeNodeFocusMode }
}
