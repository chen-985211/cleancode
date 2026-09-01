import {
  advanceCriticalSpringAxis,
  isCriticalSpringAxisSettled,
  type CriticalSpringAxis
} from '../../../src/presentation/app-shell/workbench/viewport/workbenchViewportSpring'

describe('workbench viewport spring', () => {
  it('settles without overshooting a programmatic camera target', () => {
    let axis: CriticalSpringAxis = { value: 0, velocity: 0 }
    let maximumValue = axis.value

    for (let frame = 0; frame < 180; frame += 1) {
      axis = advanceCriticalSpringAxis(axis, 100, 0.34, 1 / 120)
      maximumValue = Math.max(maximumValue, axis.value)
    }

    expect(maximumValue).toBeLessThanOrEqual(100)
    expect(axis.value).toBeCloseTo(100, 3)
    expect(isCriticalSpringAxisSettled(axis, 100, { speed: 0.01, value: 0.001 })).toBe(true)
  })

  it('preserves presentation velocity when the target reverses', () => {
    let axis: CriticalSpringAxis = { value: 0, velocity: 0 }

    for (let frame = 0; frame < 8; frame += 1) {
      axis = advanceCriticalSpringAxis(axis, 100, 0.34, 1 / 120)
    }
    const velocityBeforeRetarget = axis.velocity
    const firstRetargetedFrame = advanceCriticalSpringAxis(axis, -100, 0.34, 1 / 120)

    expect(velocityBeforeRetarget).toBeGreaterThan(0)
    expect(firstRetargetedFrame.velocity).toBeGreaterThan(0)

    axis = firstRetargetedFrame
    for (let frame = 0; frame < 30; frame += 1) {
      axis = advanceCriticalSpringAxis(axis, -100, 0.34, 1 / 120)
    }
    expect(axis.velocity).toBeLessThan(0)
  })

  it('remains stable when a delayed frame is clamped to the frame budget', () => {
    const axis = advanceCriticalSpringAxis({ value: -400, velocity: 1_200 }, 200, 0.42, 1 / 30)

    expect(Number.isFinite(axis.value)).toBe(true)
    expect(Number.isFinite(axis.velocity)).toBe(true)
    expect(axis.value).toBeGreaterThan(-400)
    expect(axis.value).toBeLessThan(200)
  })
})
