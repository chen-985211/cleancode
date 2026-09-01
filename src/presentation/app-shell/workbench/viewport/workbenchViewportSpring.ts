import {
  advanceSpringAxis,
  isSpringAxisSettled,
  type SpringAxis,
  type SpringSettlementThresholds
} from '../../../shared/motion/motionSpring'

export type CriticalSpringAxis = SpringAxis

export function advanceCriticalSpringAxis(
  axis: CriticalSpringAxis,
  target: number,
  response: number,
  deltaSeconds: number
): CriticalSpringAxis {
  return advanceSpringAxis(axis, target, { dampingRatio: 1, response }, deltaSeconds)
}

export function isCriticalSpringAxisSettled(
  axis: CriticalSpringAxis,
  target: number,
  thresholds: SpringSettlementThresholds
): boolean {
  return isSpringAxisSettled(axis, target, thresholds)
}
