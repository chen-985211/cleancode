import {
  createSpringProgressMotionController,
  type SpringProgressMotionFrameScheduler,
  type SpringProgressMotionRoot
} from './springProgressMotion'

export type SurfaceSpringPreset =
  | 'anchored'
  | 'anchored-bottom-left'
  | 'anchored-top-right'
  | 'bottom-control'
  | 'drawer-right'
  | 'fullscreen-right'

export type SurfaceSpringMotionRoot = SpringProgressMotionRoot

interface SurfaceSpringMotionControllerOptions {
  readonly preset: SurfaceSpringPreset
  readonly scheduler?: SpringProgressMotionFrameScheduler
}

interface SurfaceSpringMotionIntent {
  readonly onSettled: () => void
  readonly reducedMotion: boolean
  readonly visible: boolean
}

export interface SurfaceSpringMotionController {
  readonly dispose: () => void
  readonly intentChanged: (
    root: SurfaceSpringMotionRoot | null,
    intent: SurfaceSpringMotionIntent
  ) => void
}

const opacityProperty = '--cc-surface-motion-opacity'
const contentOpacityProperty = '--cc-surface-motion-content-opacity'
const translationXProperty = '--cc-surface-motion-translate-x'
const translationYProperty = '--cc-surface-motion-translate-y'
const scaleProperty = '--cc-surface-motion-scale'
const stateAttribute = 'data-surface-spring-state'

export function createSurfaceSpringMotionController({
  preset,
  scheduler
}: SurfaceSpringMotionControllerOptions): SurfaceSpringMotionController {
  const controller = createSpringProgressMotionController({
    clear: clearPresentation,
    dynamics: { dampingRatio: 1, response: responseForPreset(preset) },
    retargetPolicy: preset === 'anchored' ? 'preserve' : 'toward-target-only',
    scheduler,
    settlementThresholds: preset === 'bottom-control' ? { speed: 0.25, value: 0.007 } : undefined,
    stateAttribute
  })

  return {
    dispose: controller.dispose,
    intentChanged: (root, intent) => {
      controller.intentChanged(root, {
        ...intent,
        present: (motionRoot, progress) => presentSurface(motionRoot, preset, progress)
      })
    }
  }
}

function presentSurface(
  root: SurfaceSpringMotionRoot,
  preset: SurfaceSpringPreset,
  progress: number
): void {
  const remaining = 1 - progress
  const presentation = resolvePresentation(preset, remaining)
  root.style.setProperty(opacityProperty, `${round(presentation.opacity)}`)
  root.style.setProperty(contentOpacityProperty, `${round(presentation.contentOpacity)}`)
  root.style.setProperty(translationXProperty, presentation.translateX)
  root.style.setProperty(translationYProperty, presentation.translateY)
  root.style.setProperty(scaleProperty, `${round(presentation.scale)}`)
}

function resolvePresentation(preset: SurfaceSpringPreset, remaining: number) {
  if (preset === 'anchored') {
    return {
      contentOpacity: 1,
      opacity: 1 - remaining,
      scale: 1 - 0.16 * remaining,
      translateX: `calc(var(--cc-anchored-surface-offset-x) * ${round(remaining)})`,
      translateY: `calc(var(--cc-anchored-surface-offset-y) * ${round(remaining)})`
    }
  }
  if (preset === 'anchored-bottom-left') {
    return {
      contentOpacity: 1,
      opacity: 1 - remaining,
      scale: 1,
      translateX: '0px',
      translateY: `${round(4 * remaining)}px`
    }
  }
  if (preset === 'anchored-top-right') {
    return {
      contentOpacity: 1,
      opacity: 1 - remaining,
      scale: 0.97 + 0.03 * (1 - remaining),
      translateX: `${round(4 * remaining)}px`,
      translateY: `${round(-4 * remaining)}px`
    }
  }
  if (preset === 'bottom-control') {
    return {
      contentOpacity: 1,
      opacity: 1,
      scale: 1,
      translateX: '0px',
      translateY: `calc(${round(100 * remaining)}% + ${round(12 * remaining)}px)`
    }
  }
  if (preset === 'drawer-right') {
    return {
      contentOpacity: 0.72 + 0.28 * (1 - remaining),
      opacity: 1 - remaining,
      scale: 1,
      translateX: `${round(100 * remaining)}%`,
      translateY: '0px'
    }
  }
  return {
    contentOpacity: 1,
    opacity: 1 - remaining,
    scale: 0.992 + 0.008 * (1 - remaining),
    translateX: `${round(64 * remaining)}px`,
    translateY: '0px'
  }
}

function responseForPreset(preset: SurfaceSpringPreset): number {
  if (preset === 'anchored') return 0.28
  if (preset === 'anchored-bottom-left') return 0.18
  if (preset === 'anchored-top-right') return 0.24
  if (preset === 'bottom-control') return 0.16
  if (preset === 'drawer-right') return 0.34
  return 0.36
}

function clearPresentation(root: SurfaceSpringMotionRoot): void {
  root.style.removeProperty(opacityProperty)
  root.style.removeProperty(contentOpacityProperty)
  root.style.removeProperty(translationXProperty)
  root.style.removeProperty(translationYProperty)
  root.style.removeProperty(scaleProperty)
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
