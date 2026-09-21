export const directionalMenuMotionProfile = {
  hiddenScale: 0.72,
  opacityLead: 1.45,
  springResponse: 0.4
} as const

export interface DirectionalMenuPresentation {
  readonly hiddenProgress: number
  readonly opacity: number
  readonly scale: number
}

const clampProgress = (value: number): number => Math.min(Math.max(value, 0), 1)

const roundPresentationValue = (value: number): number => Number(value.toFixed(6))

export function resolveDirectionalMenuPresentation(progress: number): DirectionalMenuPresentation {
  const visibleProgress = clampProgress(progress)
  const hiddenProgress = 1 - visibleProgress

  return {
    hiddenProgress: roundPresentationValue(hiddenProgress),
    opacity: roundPresentationValue(
      Math.min(1, visibleProgress * directionalMenuMotionProfile.opacityLead)
    ),
    scale: roundPresentationValue(
      directionalMenuMotionProfile.hiddenScale +
        visibleProgress * (1 - directionalMenuMotionProfile.hiddenScale)
    )
  }
}
