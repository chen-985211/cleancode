import { describe, expect, it } from 'vitest'

import { shouldAcquireSingleInstanceLock } from '../../../src/platform/electron-main/singleInstancePolicy'

describe('singleInstancePolicy', () => {
  it('acquires the single-instance lock by default', () => {
    expect(shouldAcquireSingleInstanceLock({})).toBe(true)
  })

  it('skips the lock only for the explicit Electron test override', () => {
    expect(
      shouldAcquireSingleInstanceLock({
        CLEANCODE_TEST_DISABLE_SINGLE_INSTANCE_LOCK: '1'
      })
    ).toBe(false)
    expect(
      shouldAcquireSingleInstanceLock({
        CLEANCODE_TEST_DISABLE_SINGLE_INSTANCE_LOCK: '0'
      })
    ).toBe(true)
  })
})
