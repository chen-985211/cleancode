import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis
} from '../../../shared/motion/motionSpring'
import type { SpringProgressMotionFrameScheduler } from '../../../shared/motion/springProgressMotion'

export type ApplicationSettingsPane = 'agents' | 'canvas' | 'diagnostics' | 'shortcuts' | 'terminal'
export type ApplicationSettingsPaneDirection = 'backward' | 'forward' | 'none'

export interface ApplicationSettingsPaneMotionRoot {
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
}

export interface ApplicationSettingsPaneMotionLayer {
  readonly id: string
  readonly initialOpacity: number
  readonly initialX: number
  readonly root: ApplicationSettingsPaneMotionRoot
  readonly targetOpacity: number
  readonly targetX: number
}

interface ApplicationSettingsPaneMotionControllerOptions {
  readonly scheduler?: SpringProgressMotionFrameScheduler
}

interface ApplicationSettingsPaneMotionIntent {
  readonly onSettled: () => void
  readonly reducedMotion: boolean
}

export interface ApplicationSettingsPaneMotionController {
  readonly dispose: () => void
  readonly layersChanged: (
    layers: readonly ApplicationSettingsPaneMotionLayer[],
    intent: ApplicationSettingsPaneMotionIntent
  ) => void
}

interface LiveLayerMotion {
  readonly id: string
  opacity: SpringAxis
  root: ApplicationSettingsPaneMotionRoot
  targetOpacity: number
  targetX: number
  x: SpringAxis
}

export const applicationSettingsPaneEntryOffset = 30

const paneOrder: readonly ApplicationSettingsPane[] = [
  'shortcuts',
  'canvas',
  'terminal',
  'agents',
  'diagnostics'
]
const dynamics = { dampingRatio: 1, response: 0.3 }
const opacityProperty = '--application-settings-pane-motion-opacity'
const translationProperty = '--application-settings-pane-motion-x'
const opacityThresholds = { speed: 0.002, value: 0.0002 }
const translationThresholds = { speed: 0.02, value: 0.01 }

const browserFrameScheduler: SpringProgressMotionFrameScheduler = {
  cancelFrame: (frameId) => {
    if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frameId)
    else window.clearTimeout(frameId)
  },
  now: () => window.performance.now(),
  requestFrame: (callback) => {
    if (typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(callback)
    }
    return window.setTimeout(() => callback(window.performance.now()), 1000 / 60)
  }
}

export function resolveApplicationSettingsPaneDirection(
  from: ApplicationSettingsPane,
  to: ApplicationSettingsPane
): ApplicationSettingsPaneDirection {
  const difference = paneOrder.indexOf(to) - paneOrder.indexOf(from)
  if (difference === 0) return 'none'
  return difference > 0 ? 'forward' : 'backward'
}

export function createApplicationSettingsPaneMotionController({
  scheduler = browserFrameScheduler
}: ApplicationSettingsPaneMotionControllerOptions = {}): ApplicationSettingsPaneMotionController {
  const liveLayers = new Map<string, LiveLayerMotion>()
  let animationFrameId: number | null = null
  let lastFrameTimestamp = scheduler.now()
  let onSettled = (): void => undefined

  const cancelFrame = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
  }

  const scheduleFrame = (): void => {
    if (animationFrameId !== null) return
    lastFrameTimestamp = scheduler.now()
    animationFrameId = scheduler.requestFrame(advanceFrame)
  }

  function advanceFrame(timestamp: number): void {
    animationFrameId = null
    const elapsedSeconds = Math.max(0, (timestamp - lastFrameTimestamp) / 1000)
    lastFrameTimestamp = timestamp

    for (const layer of liveLayers.values()) {
      layer.x = advanceSpringAxis(layer.x, layer.targetX, dynamics, elapsedSeconds)
      layer.opacity = advanceSpringAxis(
        layer.opacity,
        layer.targetOpacity,
        dynamics,
        elapsedSeconds
      )
      settleAndPresentLayer(layer)
    }

    if (allLayersSettled(liveLayers.values())) onSettled()
    else scheduleFrame()
  }

  return {
    dispose: () => {
      cancelFrame()
      for (const layer of liveLayers.values()) clearLayer(layer.root)
      liveLayers.clear()
    },
    layersChanged: (layers, intent) => {
      onSettled = intent.onSettled
      const nextIds = new Set(layers.map((layer) => layer.id))
      for (const [id, liveLayer] of liveLayers) {
        if (nextIds.has(id)) continue
        clearLayer(liveLayer.root)
        liveLayers.delete(id)
      }

      for (const layer of layers) {
        const current = liveLayers.get(layer.id)
        if (!current) {
          liveLayers.set(layer.id, {
            id: layer.id,
            opacity: { value: layer.initialOpacity, velocity: 0 },
            root: layer.root,
            targetOpacity: layer.targetOpacity,
            targetX: layer.targetX,
            x: { value: layer.initialX, velocity: 0 }
          })
          continue
        }
        if (current.root !== layer.root) {
          clearLayer(current.root)
          current.root = layer.root
        }
        current.x = retargetSpringAxis(current.x, layer.targetX, 'toward-target-only')
        current.opacity = retargetSpringAxis(
          current.opacity,
          layer.targetOpacity,
          'toward-target-only'
        )
        current.targetX = layer.targetX
        current.targetOpacity = layer.targetOpacity
      }

      if (intent.reducedMotion) {
        cancelFrame()
        for (const layer of liveLayers.values()) {
          layer.x = { value: layer.targetX, velocity: 0 }
          layer.opacity = { value: layer.targetOpacity, velocity: 0 }
          presentLayer(layer)
        }
        onSettled()
        return
      }

      for (const layer of liveLayers.values()) presentLayer(layer)
      if (allLayersSettled(liveLayers.values())) onSettled()
      else scheduleFrame()
    }
  }
}

function settleAndPresentLayer(layer: LiveLayerMotion): void {
  if (isSpringAxisSettled(layer.x, layer.targetX, translationThresholds)) {
    layer.x = { value: layer.targetX, velocity: 0 }
  }
  if (isSpringAxisSettled(layer.opacity, layer.targetOpacity, opacityThresholds)) {
    layer.opacity = { value: layer.targetOpacity, velocity: 0 }
  }
  presentLayer(layer)
}

function presentLayer(layer: LiveLayerMotion): void {
  layer.root.style.setProperty(translationProperty, `${round(layer.x.value)}px`)
  layer.root.style.setProperty(opacityProperty, `${round(layer.opacity.value)}`)
}

function clearLayer(root: ApplicationSettingsPaneMotionRoot): void {
  root.style.removeProperty(translationProperty)
  root.style.removeProperty(opacityProperty)
}

function allLayersSettled(layers: Iterable<LiveLayerMotion>): boolean {
  for (const layer of layers) {
    if (
      !isSpringAxisSettled(layer.x, layer.targetX, translationThresholds) ||
      !isSpringAxisSettled(layer.opacity, layer.targetOpacity, opacityThresholds)
    ) {
      return false
    }
  }
  return true
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
