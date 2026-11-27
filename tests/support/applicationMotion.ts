import { vi } from 'vitest'

import { motionPreferenceStore } from '../../src/presentation/shared/motion/motionPreference'

// Geometry and focus tests can inspect a settled result without advancing a spring.
export function stubImmediateMotion(immediate = true): void {
  vi.spyOn(motionPreferenceStore, 'getSnapshot').mockReturnValue(immediate)
}
