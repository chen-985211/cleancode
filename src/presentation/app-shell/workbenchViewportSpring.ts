export interface CriticalSpringAxis {
  readonly value: number
  readonly velocity: number
}

interface CriticalSpringSettlementThresholds {
  readonly speed: number
  readonly value: number
}

export function advanceCriticalSpringAxis(
  axis: CriticalSpringAxis,
  target: number,
  response: number,
  deltaSeconds: number
): CriticalSpringAxis {
  if (response <= 0 || deltaSeconds <= 0) {
    return axis
  }

  const angularFrequency = (2 * Math.PI) / response
  const displacement = axis.value - target
  const velocityTerm = axis.velocity + angularFrequency * displacement
  const decay = Math.exp(-angularFrequency * deltaSeconds)

  return {
    value: target + (displacement + velocityTerm * deltaSeconds) * decay,
    velocity: (axis.velocity - angularFrequency * velocityTerm * deltaSeconds) * decay
  }
}

export function isCriticalSpringAxisSettled(
  axis: CriticalSpringAxis,
  target: number,
  thresholds: CriticalSpringSettlementThresholds
): boolean {
  return (
    Math.abs(axis.value - target) <= thresholds.value && Math.abs(axis.velocity) <= thresholds.speed
  )
}
