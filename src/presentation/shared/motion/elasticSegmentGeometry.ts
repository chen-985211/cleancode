export interface SegmentSlot {
  readonly center: number
  readonly width: number
}

export interface SegmentSample {
  readonly x: number
  readonly time: number
}

function nearestSegment(slots: readonly SegmentSlot[], center: number): number {
  return slots.reduce(
    (nearest, slot, index) =>
      Math.abs(slot.center - center) < Math.abs(slots[nearest].center - center) ? index : nearest,
    0
  )
}

// Fit the recent pointer trajectory rather than trusting a single event interval.
export function segmentReleaseVelocity(samples: readonly SegmentSample[], now: number): number {
  const recent = samples.filter((sample) => now - sample.time <= 90)
  if (recent.length < 2) return 0
  const averageTime = recent.reduce((sum, sample) => sum + sample.time, 0) / recent.length
  const averageX = recent.reduce((sum, sample) => sum + sample.x, 0) / recent.length
  let covariance = 0
  let variance = 0
  for (const sample of recent) {
    covariance += (sample.time - averageTime) * (sample.x - averageX)
    variance += (sample.time - averageTime) ** 2
  }
  return variance > 0 ? Math.max(-4000, Math.min(4000, (covariance / variance) * 1000)) : 0
}

export function segmentLanding(
  slots: readonly SegmentSlot[],
  center: number,
  velocity: number
): number {
  return nearestSegment(slots, center + velocity * 0.18)
}

export function resistSegment(center: number, width: number, trackWidth: number): SegmentSlot {
  const minimum = 3 + width / 2
  const maximum = trackWidth - 3 - width / 2
  const bounded = Math.max(minimum, Math.min(maximum, center))
  const overflow = center - bounded
  if (overflow === 0) return { center, width }
  const compression = width * 0.42 * (1 - Math.exp(-Math.abs(overflow) / width))
  return {
    center: bounded + (Math.sign(overflow) * compression) / 2,
    width: width - compression
  }
}
