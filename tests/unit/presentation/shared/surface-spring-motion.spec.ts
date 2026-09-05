import {
  createSurfaceSpringMotionController,
  type SurfaceSpringMotionRoot
} from '../../../../src/presentation/shared/motion/surfaceSpringMotion'
import type { SpringProgressMotionFrameScheduler } from '../../../../src/presentation/shared/motion/springProgressMotion'

describe('surface spring motion', () => {
  it.each([true, false])(
    'keeps an anchored surface visibly between its compact and full size during the transition: visible=%s',
    (visible) => {
      const scheduler = createFrameScheduler()
      const root = createRoot()
      const controller = createSurfaceSpringMotionController({ preset: 'anchored', scheduler })
      const settled = vi.fn()
      controller.intentChanged(root, {
        onSettled: settled,
        reducedMotion: false,
        visible: true
      })
      const compactScale = readNumber(root, '--cc-surface-motion-scale')
      expect.soft(compactScale).toBeGreaterThanOrEqual(0.7)
      expect.soft(compactScale).toBeLessThan(0.9)
      if (!visible) {
        scheduler.advanceUntilIdle()
        settled.mockClear()
        controller.intentChanged(root, {
          onSettled: settled,
          reducedMotion: false,
          visible: false
        })
      }

      scheduler.advanceNextFrame(100)

      const opacity = readNumber(root, '--cc-surface-motion-opacity')
      const scale = readNumber(root, '--cc-surface-motion-scale')
      expect.soft(opacity).toBeGreaterThan(0.2)
      expect.soft(opacity).toBeLessThan(0.8)
      expect.soft(scale).toBeGreaterThan(compactScale)
      expect.soft(scale).toBeLessThan(0.97)
      expect(settled).not.toHaveBeenCalled()

      scheduler.advanceUntilIdle()
      expect(readNumber(root, '--cc-surface-motion-opacity')).toBe(visible ? 1 : 0)
      expect(readNumber(root, '--cc-surface-motion-scale')).toBe(visible ? 1 : compactScale)
      expect(settled).toHaveBeenCalledOnce()
    }
  )

  it.each([false, true])(
    'carries an anchored surface position and velocity into the new visible intent: %s',
    (visible) => {
      const scheduler = createFrameScheduler()
      const root = createRoot()
      const obsoleteSettled = vi.fn()
      const settled = vi.fn()
      const controller = createSurfaceSpringMotionController({ preset: 'anchored', scheduler })
      controller.intentChanged(root, {
        onSettled: obsoleteSettled,
        reducedMotion: false,
        visible: true
      })
      if (visible) {
        scheduler.advanceUntilIdle()
        obsoleteSettled.mockClear()
        controller.intentChanged(root, {
          onSettled: obsoleteSettled,
          reducedMotion: false,
          visible: false
        })
      }
      scheduler.advanceNextFrame(40)
      const previousOpacity = readNumber(root, '--cc-surface-motion-opacity')
      scheduler.advanceNextFrame(1)
      const currentOpacity = readNumber(root, '--cc-surface-motion-opacity')
      const velocityBefore = currentOpacity - previousOpacity
      const presentation = new Map(root.properties)

      controller.intentChanged(root, { onSettled: settled, reducedMotion: false, visible })

      expect(root.properties).toEqual(presentation)
      scheduler.advanceNextFrame(1)
      const velocityAfter = readNumber(root, '--cc-surface-motion-opacity') - currentOpacity
      expect(Math.sign(velocityAfter)).toBe(Math.sign(velocityBefore))
      expect(Math.abs(velocityAfter - velocityBefore)).toBeLessThan(Math.abs(velocityBefore) * 0.15)

      scheduler.advanceUntilIdle()
      expect(readNumber(root, '--cc-surface-motion-opacity')).toBe(visible ? 1 : 0)
      expect(obsoleteSettled).not.toHaveBeenCalled()
      expect(settled).toHaveBeenCalledOnce()
    }
  )

  it.each([
    ['anchored-bottom-left', '--cc-surface-motion-translate-y', 1],
    ['anchored-top-right', '--cc-surface-motion-translate-x', 1],
    ['drawer-right', '--cc-surface-motion-translate-x', 1],
    ['fullscreen-right', '--cc-surface-motion-translate-x', 1]
  ] as const)('enters the %s surface from its trigger-side origin', (preset, property, sign) => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createSurfaceSpringMotionController({ preset, scheduler })

    controller.intentChanged(root, {
      onSettled: vi.fn(),
      reducedMotion: false,
      visible: true
    })

    expect(signedMagnitude(root.properties.get(property))).toBe(sign)
    expect(readNumber(root, '--cc-surface-motion-opacity')).toBe(0)

    scheduler.advanceNextFrame(80)
    expect(readNumber(root, '--cc-surface-motion-opacity')).toBeGreaterThan(0)
    expect(readNumber(root, '--cc-surface-motion-opacity')).toBeLessThan(1)

    scheduler.advanceUntilIdle()
    expect(readNumber(root, '--cc-surface-motion-opacity')).toBe(1)
    expect(readNumber(root, property)).toBe(0)
  })

  it('reverses a drawer from its current spring presentation', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createSurfaceSpringMotionController({
      preset: 'drawer-right',
      scheduler
    })

    controller.intentChanged(root, {
      onSettled: vi.fn(),
      reducedMotion: false,
      visible: true
    })
    scheduler.advanceNextFrame(90)
    const opacityBeforeReversal = readNumber(root, '--cc-surface-motion-opacity')
    const translationBeforeReversal = root.properties.get('--cc-surface-motion-translate-x')

    controller.intentChanged(root, {
      onSettled: vi.fn(),
      reducedMotion: false,
      visible: false
    })

    expect(readNumber(root, '--cc-surface-motion-opacity')).toBe(opacityBeforeReversal)
    expect(root.properties.get('--cc-surface-motion-translate-x')).toBe(translationBeforeReversal)

    scheduler.advanceNextFrame()
    expect(readNumber(root, '--cc-surface-motion-opacity')).toBeLessThan(opacityBeforeReversal)
  })

  it('keeps anchored menu collapse restrained enough for text to remain visually stable', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createSurfaceSpringMotionController({
      preset: 'anchored-top-right',
      scheduler
    })

    controller.intentChanged(root, {
      onSettled: vi.fn(),
      reducedMotion: false,
      visible: true
    })

    expect(readNumber(root, '--cc-surface-motion-scale')).toBeGreaterThanOrEqual(0.94)
    expect(Math.abs(readNumber(root, '--cc-surface-motion-translate-x'))).toBeLessThanOrEqual(6)
    expect(Math.abs(readNumber(root, '--cc-surface-motion-translate-y'))).toBeLessThanOrEqual(6)
  })

  it('moves a bottom-left anchored menu only toward its trigger without scaling', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createSurfaceSpringMotionController({
      preset: 'anchored-bottom-left',
      scheduler
    })

    controller.intentChanged(root, {
      onSettled: vi.fn(),
      reducedMotion: false,
      visible: true
    })

    expect(readNumber(root, '--cc-surface-motion-translate-x')).toBe(0)
    expect(readNumber(root, '--cc-surface-motion-translate-y')).toBe(4)
    expect(readNumber(root, '--cc-surface-motion-scale')).toBe(1)
  })

  it('hands bottom controls upward and dismisses them downward without scaling', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createSurfaceSpringMotionController({
      preset: 'bottom-control',
      scheduler
    })
    const settled = vi.fn()

    controller.intentChanged(root, {
      onSettled: settled,
      reducedMotion: false,
      visible: true
    })

    expect(readNumber(root, '--cc-surface-motion-translate-x')).toBe(0)
    expect(root.properties.get('--cc-surface-motion-translate-y')).toBe('calc(100% + 12px)')
    expect(readNumber(root, '--cc-surface-motion-opacity')).toBe(1)
    expect(readNumber(root, '--cc-surface-motion-scale')).toBe(1)

    scheduler.advanceNextFrame(80)
    expect(readNumber(root, '--cc-surface-motion-opacity')).toBe(1)
    expect(readBottomTranslationPercent(root)).toBeGreaterThan(0)
    expect(readBottomTranslationPercent(root)).toBeLessThan(35)

    scheduler.advanceUntilIdle()
    expect(root.properties.get('--cc-surface-motion-translate-y')).toBe('calc(0% + 0px)')
    settled.mockClear()

    controller.intentChanged(root, {
      onSettled: settled,
      reducedMotion: false,
      visible: false
    })

    expect(readBottomTranslationPercent(root)).toBe(0)
    scheduler.advanceNextFrame(40)
    expect(readBottomTranslationPercent(root)).toBeGreaterThan(0)
    expect(readBottomTranslationPercent(root)).toBeLessThan(100)
    expect(readNumber(root, '--cc-surface-motion-opacity')).toBe(1)
    expect(readNumber(root, '--cc-surface-motion-scale')).toBe(1)

    scheduler.advanceNextFrame(160)
    expect(settled).toHaveBeenCalledOnce()
  })

  it('continuously projects a closing drawer until it reaches the hidden endpoint', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const settled = vi.fn()
    const controller = createSurfaceSpringMotionController({
      preset: 'drawer-right',
      scheduler
    })

    controller.intentChanged(root, {
      onSettled: settled,
      reducedMotion: false,
      visible: true
    })
    scheduler.advanceUntilIdle()
    controller.intentChanged(root, {
      onSettled: settled,
      reducedMotion: false,
      visible: false
    })

    scheduler.advanceUntil(() => readTranslationPercent(root) >= 50)

    expect(readTranslationPercent(root)).toBeLessThan(75)
    expect(readNumber(root, '--cc-surface-motion-opacity')).toBeGreaterThan(0)
    expect(readNumber(root, '--cc-surface-motion-opacity')).toBeLessThan(1)
    expect(readNumber(root, '--cc-surface-motion-content-opacity')).toBeGreaterThan(0)
    expect(readNumber(root, '--cc-surface-motion-content-opacity')).toBeLessThan(1)
    expect(root.attributes.get('data-surface-spring-state')).toBe('closing')

    scheduler.advanceUntilIdle()
    expect(readTranslationPercent(root)).toBe(100)
    expect(readNumber(root, '--cc-surface-motion-opacity')).toBe(0)
    expect(root.attributes.get('data-surface-spring-state')).toBe('closed')
  })

  it('projects directly to the visible endpoint for reduced motion', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const settled = vi.fn()
    const controller = createSurfaceSpringMotionController({
      preset: 'fullscreen-right',
      scheduler
    })

    controller.intentChanged(root, {
      onSettled: settled,
      reducedMotion: true,
      visible: true
    })

    expect(readNumber(root, '--cc-surface-motion-opacity')).toBe(1)
    expect(readNumber(root, '--cc-surface-motion-translate-x')).toBe(0)
    expect(scheduler.pendingFrames()).toBe(0)
    expect(settled).toHaveBeenCalledOnce()
  })

  it('removes bottom-control translation and scale immediately for reduced motion', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createSurfaceSpringMotionController({
      preset: 'bottom-control',
      scheduler
    })

    controller.intentChanged(root, {
      onSettled: vi.fn(),
      reducedMotion: true,
      visible: true
    })

    expect(readNumber(root, '--cc-surface-motion-opacity')).toBe(1)
    expect(readBottomTranslationPercent(root)).toBe(0)
    expect(readNumber(root, '--cc-surface-motion-scale')).toBe(1)
    expect(scheduler.pendingFrames()).toBe(0)
  })
})

function signedMagnitude(value: string | undefined): number {
  const numericValue = Number.parseFloat(value ?? '0')
  return numericValue === 0 ? 0 : Math.sign(numericValue)
}

function readNumber(root: ReturnType<typeof createRoot>, property: string): number {
  return Number.parseFloat(root.properties.get(property) ?? '0')
}

function readTranslationPercent(root: ReturnType<typeof createRoot>): number {
  return readNumber(root, '--cc-surface-motion-translate-x')
}

function readBottomTranslationPercent(root: ReturnType<typeof createRoot>): number {
  return Number.parseFloat(
    root.properties.get('--cc-surface-motion-translate-y')?.match(/calc\(([-\d.]+)%/)?.[1] ?? '0'
  )
}

function createRoot(): SurfaceSpringMotionRoot & {
  readonly attributes: Map<string, string>
  readonly properties: Map<string, string>
} {
  const attributes = new Map<string, string>()
  const properties = new Map<string, string>()
  return {
    attributes,
    properties,
    removeAttribute: (name) => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, value),
    style: {
      removeProperty: (property) => {
        const previousValue = properties.get(property) ?? ''
        properties.delete(property)
        return previousValue
      },
      setProperty: (property, value) => {
        properties.set(property, value ?? '')
      }
    }
  }
}

function createFrameScheduler(): SpringProgressMotionFrameScheduler & {
  readonly advanceNextFrame: (milliseconds?: number) => void
  readonly advanceUntil: (predicate: () => boolean) => void
  readonly advanceUntilIdle: () => void
  readonly pendingFrames: () => number
} {
  let nextFrameId = 1
  let now = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  const advanceNextFrame = (milliseconds = 1000 / 120): void => {
    now += milliseconds
    const pendingCallbacks = [...callbacks.values()]
    callbacks.clear()
    pendingCallbacks.forEach((callback) => callback(now))
  }
  return {
    advanceNextFrame,
    advanceUntil: (predicate) => {
      for (let frame = 0; frame < 240 && callbacks.size > 0; frame += 1) {
        advanceNextFrame()
        if (predicate()) return
      }
    },
    advanceUntilIdle: () => {
      for (let frame = 0; frame < 240 && callbacks.size > 0; frame += 1) advanceNextFrame()
    },
    cancelFrame: (frameId) => callbacks.delete(frameId),
    now: () => now,
    pendingFrames: () => callbacks.size,
    requestFrame: (callback) => {
      const frameId = nextFrameId
      nextFrameId += 1
      callbacks.set(frameId, callback)
      return frameId
    }
  }
}
