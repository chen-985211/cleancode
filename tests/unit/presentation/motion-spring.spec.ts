import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis,
  type SpringDynamics
} from '../../../src/presentation/app-shell/motionSpring'

describe('presentation spring motion', () => {
  it.each([
    { dampingRatio: 1, name: 'critical' },
    { dampingRatio: 0.72, name: 'underdamped' }
  ])('consumes the full elapsed time for $name damping', ({ dampingRatio }) => {
    const dynamics = { dampingRatio, response: 0.36 }
    const delayed = advanceSpringAxis({ value: 0, velocity: 0 }, 1, dynamics, 0.1)
    let regular: SpringAxis = { value: 0, velocity: 0 }

    for (let frame = 0; frame < 12; frame += 1) {
      regular = advanceSpringAxis(regular, 1, dynamics, 1 / 120)
    }

    expect(delayed.value).toBeCloseTo(regular.value, 12)
    expect(delayed.velocity).toBeCloseTo(regular.velocity, 12)
  })

  it('keeps a critical spring monotonic while allowing the named underdamped feedback to rebound', () => {
    const criticalValues = sampleSpring({ dampingRatio: 1, response: 0.36 })
    const underdampedValues = sampleSpring({ dampingRatio: 0.72, response: 0.36 })

    expect(Math.max(...criticalValues)).toBeLessThanOrEqual(1)
    expect(Math.max(...underdampedValues)).toBeGreaterThan(1)
    expect(criticalValues.at(-1)).toBeCloseTo(1, 5)
    expect(underdampedValues.at(-1)).toBeCloseTo(1, 5)
  })

  it('makes each owner choose whether opposing velocity is preserved', () => {
    const movingAwayFromClosed = { value: 0.4, velocity: 2 }

    expect(retargetSpringAxis(movingAwayFromClosed, 0, 'preserve')).toEqual(movingAwayFromClosed)
    expect(retargetSpringAxis(movingAwayFromClosed, 0, 'toward-target-only')).toEqual({
      value: 0.4,
      velocity: 0
    })
    expect(retargetSpringAxis(movingAwayFromClosed, 1, 'toward-target-only')).toEqual(
      movingAwayFromClosed
    )
  })

  it('settles only when both value and speed are within owner thresholds', () => {
    const thresholds = { speed: 0.01, value: 0.001 }

    expect(isSpringAxisSettled({ value: 0.999_5, velocity: 0.005 }, 1, thresholds)).toBe(true)
    expect(isSpringAxisSettled({ value: 0.998, velocity: 0.005 }, 1, thresholds)).toBe(false)
    expect(isSpringAxisSettled({ value: 0.999_5, velocity: 0.02 }, 1, thresholds)).toBe(false)
  })
})

function sampleSpring(dynamics: SpringDynamics): number[] {
  const values: number[] = []
  let axis: SpringAxis = { value: 0, velocity: 0 }

  for (let frame = 0; frame < 240; frame += 1) {
    axis = advanceSpringAxis(axis, 1, dynamics, 1 / 120)
    values.push(axis.value)
  }

  return values
}
