import {
  createElasticSegmentMotion,
  type SegmentPresentation
} from '../../../../src/presentation/shared/motion/elasticSegmentMotion'
import {
  resistSegment,
  segmentLanding,
  segmentReleaseVelocity
} from '../../../../src/presentation/shared/motion/elasticSegmentGeometry'

const slots = [0, 1, 2].map((index) => ({ center: 53 + index * 100, width: 100 }))
const pointer = (x: number, time: number, id = 1, y = 20) => ({ x, time, id, y })

function harness(reduced = true) {
  const commit = vi.fn()
  let frame: SegmentPresentation = { left: 0, right: 0, inset: 3, phase: 'idle' }
  const motion = createElasticSegmentMotion((next) => {
    frame = next
  }, commit)
  motion.configure(slots, 306, 0, reduced)
  return { motion, commit, frame: () => frame }
}

describe('elastic segment interaction', () => {
  it.each([2, 3])('uses the same final selection contract with %s options', (count) => {
    const h = harness()
    const choices = slots.slice(0, count)
    h.motion.configure(choices, count * 100 + 6, 0, true)
    h.motion.down(pointer(53, 0), 0)
    h.motion.move(pointer(133, 200))
    h.motion.up(pointer(133, 400))
    expect(h.commit).toHaveBeenLastCalledWith(1)
    h.motion.down(pointer(153, 500), 1)
    h.motion.move(pointer(135, 510))
    h.motion.up(pointer(110, 520))
    expect(h.commit.mock.calls).toEqual([[1], [0]])
    expect(h.frame()).toMatchObject({ left: 3, right: 103, phase: 'idle' })
    h.motion.dispose()
  })

  it('commits a tap once on release, including a subsequent compatibility click', () => {
    const h = harness()
    h.motion.down(pointer(153, 0), 1)
    expect(h.commit).not.toHaveBeenCalled()
    h.motion.up(pointer(153, 20))
    h.motion.select(1)
    expect(h.commit).toHaveBeenCalledExactlyOnceWith(1)
    expect(h.frame()).toMatchObject({ left: 103, right: 203, phase: 'idle' })
    h.motion.dispose()
  })

  it.each([false, true])(
    'follows a slow drag without committing intermediate settings (reduced %s)',
    (reduced) => {
      const h = harness(reduced)
      h.motion.down(pointer(43, 0), 0)
      h.motion.move(pointer(103, 120))
      expect((h.frame().left + h.frame().right) / 2).toBeCloseTo(113)
      expect(h.commit).not.toHaveBeenCalled()
      h.motion.move(pointer(113, 300))
      h.motion.up(pointer(113, 450))
      expect(h.commit).toHaveBeenCalledExactlyOnceWith(1)
      h.motion.dispose()
    }
  )

  it('projects a short fast throw past the nearest option and honors a reversal', () => {
    const h = harness()
    h.motion.down(pointer(53, 0), 0)
    h.motion.move(pointer(70, 12))
    h.motion.move(pointer(85, 24))
    h.motion.up(pointer(88, 27))
    expect(h.commit).toHaveBeenLastCalledWith(2)
    h.motion.down(pointer(253, 200), 2)
    h.motion.move(pointer(290, 240))
    h.motion.move(pointer(270, 310))
    h.motion.move(pointer(220, 330))
    h.motion.up(pointer(210, 335))
    expect(h.commit).toHaveBeenLastCalledWith(0)
    expect(h.commit).toHaveBeenCalledTimes(2)
    h.motion.dispose()
  })

  it('resists both boundaries without losing the material or changing the setting', () => {
    const h = harness(false)
    h.motion.down(pointer(53, 0), 0)
    h.motion.move(pointer(-347, 200))
    expect(h.frame().left).toBe(3)
    expect(h.frame().right - h.frame().left).toBeGreaterThan(50)
    expect(h.frame().right - h.frame().left).toBeLessThan(100)
    h.motion.move(pointer(653, 400))
    expect(h.frame().right).toBe(303)
    expect(h.frame().left).toBeLessThan(253)
    expect(h.commit).not.toHaveBeenCalled()
    h.motion.cancel()
    expect(h.commit).not.toHaveBeenCalled()
    h.motion.dispose()
  })

  it.each(['cancel', 'vertical', 'lost', 'external', 'resize'] as const)(
    'abandons the gesture on %s without a late release commit',
    (reason) => {
      const h = harness()
      h.motion.down(pointer(53, 0), 0)
      if (reason === 'vertical') h.motion.move(pointer(55, 30, 1, 60))
      else {
        h.motion.move(pointer(153, 100))
        if (reason === 'external') h.motion.configure(slots, 306, 2, true)
        else if (reason === 'resize')
          h.motion.configure(
            slots.map((slot) => ({ ...slot, center: slot.center + 10 })),
            326,
            0,
            true
          )
        else h.motion.cancel()
      }
      h.motion.up(pointer(253, 130))
      expect(h.commit).not.toHaveBeenCalled()
      h.motion.dispose()
    }
  )

  it('ignores another pointer and an off-target tap release', () => {
    const h = harness()
    h.motion.down(pointer(153, 0), 1)
    expect(h.motion.down(pointer(253, 1, 2), 2)).toBe(false)
    h.motion.move(pointer(250, 20, 2))
    h.motion.up(pointer(250, 30, 2))
    expect(h.commit).not.toHaveBeenCalled()
    h.motion.up(pointer(180, 50))
    expect(h.commit).not.toHaveBeenCalled()
    h.motion.dispose()
  })

  it('redirects consecutive selections and settles immediately when reduced motion turns on', () => {
    const h = harness(false)
    h.motion.select(2)
    const current = h.frame()
    h.motion.select(1)
    expect(h.frame().left).toBe(current.left)
    h.motion.configure(slots, 306, 1, true)
    expect(h.frame()).toMatchObject({ left: 103, right: 203, phase: 'idle' })
    expect(h.commit.mock.calls).toEqual([[2], [1]])
    h.motion.dispose()
  })

  it('removes elastic deformation immediately when reduced motion changes during a drag', () => {
    const h = harness(false)
    h.motion.down(pointer(53, 0), 0)
    h.motion.move(pointer(-100, 100))
    h.motion.configure(slots, 306, 0, true)
    expect(h.frame()).toMatchObject({ left: 3, right: 103, inset: 3 })
    h.motion.move(pointer(153, 400))
    h.motion.up(pointer(153, 600))
    expect(h.commit).toHaveBeenCalledExactlyOnceWith(1)
    h.motion.dispose()
  })

  it('releases motion subscriptions and never publishes after disposal', () => {
    const paint = vi.fn()
    const commit = vi.fn()
    const motion = createElasticSegmentMotion(paint, commit)
    motion.configure(slots, 306, 0, true)
    motion.dispose()
    paint.mockClear()
    motion.select(2)
    expect(paint).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('segment momentum and resistance', () => {
  it.each([20, 100, 1000])('projects a bounded landing at speed %s', (speed) => {
    expect(segmentLanding(slots, 153, speed)).toBeGreaterThanOrEqual(1)
    expect(segmentLanding(slots, 153, -speed)).toBeLessThanOrEqual(1)
  })
  it('uses recent motion only and lets a held pointer lose momentum', () => {
    const samples = [
      { x: 0, time: 0 },
      { x: 50, time: 50 },
      { x: 100, time: 100 }
    ]
    expect(segmentReleaseVelocity(samples, 100)).toBeCloseTo(1000)
    expect(segmentReleaseVelocity(samples, 250)).toBe(0)
  })
  it('has progressive, bounded resistance on both ends', () => {
    const near = resistSegment(-47, 100, 306)
    const far = resistSegment(-1047, 100, 306)
    expect(near.width).toBeGreaterThan(far.width)
    expect(far.width).toBeGreaterThanOrEqual(58)
    expect(near.center - near.width / 2).toBeCloseTo(3)
    const right = resistSegment(406, 100, 306)
    expect(right.center + right.width / 2).toBeCloseTo(303)
  })
})
