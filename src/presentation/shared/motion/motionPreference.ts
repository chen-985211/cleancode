export interface MotionPreferenceStore {
  readonly getSnapshot: () => boolean
  readonly subscribe: (listener: () => void) => () => void
}

// CleanCode renders full motion by default. Individual interactions can still
// request an immediate result, for example when restoring an existing surface.
export const motionPreferenceStore: MotionPreferenceStore = {
  getSnapshot: () => false,
  subscribe: () => () => {}
}

export function prefersReducedMotion(): boolean {
  return motionPreferenceStore.getSnapshot()
}
