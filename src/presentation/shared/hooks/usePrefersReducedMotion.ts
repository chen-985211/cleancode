import { useSyncExternalStore } from 'react'

import { motionPreferenceStore, type MotionPreferenceStore } from '../motion/motionPreference'

export function usePrefersReducedMotion(
  store: MotionPreferenceStore = motionPreferenceStore
): boolean {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false)
}
