export interface SpringAxis {
  readonly value: number
  readonly velocity: number
}

export interface SpringDynamics {
  readonly dampingRatio: number
  readonly response: number
}

export interface SpringSettlementThresholds {
  readonly speed: number
  readonly value: number
}

export type SpringRetargetPolicy = 'preserve' | 'toward-target-only'

const maximumSpringStepSeconds = 1 / 30
const criticalDampingTolerance = 1e-8

export function advanceSpringAxis(
  axis: SpringAxis,
  target: number,
  dynamics: SpringDynamics,
  elapsedSeconds: number
): SpringAxis {
  if (
    dynamics.response <= 0 ||
    dynamics.dampingRatio <= 0 ||
    dynamics.dampingRatio > 1 ||
    elapsedSeconds <= 0 ||
    !Number.isFinite(elapsedSeconds)
  ) {
    return axis
  }

  const stepCount = Math.max(1, Math.ceil(elapsedSeconds / maximumSpringStepSeconds))
  const stepSeconds = elapsedSeconds / stepCount
  let nextAxis = axis

  for (let step = 0; step < stepCount; step += 1) {
    nextAxis = advanceSpringStep(nextAxis, target, dynamics, stepSeconds)
    if (nextAxis.value === target && nextAxis.velocity === 0) break
  }

  return nextAxis
}

export function retargetSpringAxis(
  axis: SpringAxis,
  target: number,
  policy: SpringRetargetPolicy
): SpringAxis {
  if (policy === 'preserve' || (target - axis.value) * axis.velocity >= 0) return axis
  return { value: axis.value, velocity: 0 }
}

export function isSpringAxisSettled(
  axis: SpringAxis,
  target: number,
  thresholds: SpringSettlementThresholds
): boolean {
  return (
    Math.abs(axis.value - target) <= thresholds.value && Math.abs(axis.velocity) <= thresholds.speed
  )
}

function advanceSpringStep(
  axis: SpringAxis,
  target: number,
  dynamics: SpringDynamics,
  elapsedSeconds: number
): SpringAxis {
  const angularFrequency = (2 * Math.PI) / dynamics.response
  const displacement = axis.value - target

  if (Math.abs(1 - dynamics.dampingRatio) <= criticalDampingTolerance) {
    const velocityTerm = axis.velocity + angularFrequency * displacement
    const decay = Math.exp(-angularFrequency * elapsedSeconds)
    return {
      value: target + (displacement + velocityTerm * elapsedSeconds) * decay,
      velocity: (axis.velocity - angularFrequency * velocityTerm * elapsedSeconds) * decay
    }
  }

  const dampedFrequency =
    angularFrequency * Math.sqrt(1 - dynamics.dampingRatio * dynamics.dampingRatio)
  const velocityCoefficient =
    (axis.velocity + dynamics.dampingRatio * angularFrequency * displacement) / dampedFrequency
  const decay = Math.exp(-dynamics.dampingRatio * angularFrequency * elapsedSeconds)
  const cosine = Math.cos(dampedFrequency * elapsedSeconds)
  const sine = Math.sin(dampedFrequency * elapsedSeconds)
  const nextDisplacement = decay * (displacement * cosine + velocityCoefficient * sine)
  const nextVelocity =
    decay *
    (-dynamics.dampingRatio *
      angularFrequency *
      (displacement * cosine + velocityCoefficient * sine) +
      dampedFrequency * (-displacement * sine + velocityCoefficient * cosine))

  return {
    value: target + nextDisplacement,
    velocity: nextVelocity
  }
}
