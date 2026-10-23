import { animate, motionValue } from 'motion'
import {
  resistSegment,
  segmentLanding,
  segmentReleaseVelocity,
  type SegmentSample,
  type SegmentSlot
} from './elasticSegmentGeometry'

export interface SegmentPointer extends SegmentSample {
  readonly y: number
  readonly id: number
}

interface Gesture {
  readonly origin: SegmentPointer
  readonly option: number
  readonly canDrag: boolean
  readonly center: number
  readonly width: number
  readonly samples: SegmentSample[]
  dragging: boolean
}

export interface SegmentPresentation {
  readonly left: number
  readonly right: number
  readonly inset: number
  readonly phase: 'idle' | 'pressed' | 'dragging' | 'settling'
}

// The fast carriage and its slower follower stretch one continuous material.
// Both retain their live position and velocity when a new intent arrives.
export function createElasticSegmentMotion(
  paint: (presentation: SegmentPresentation) => void,
  commit: (index: number) => void
) {
  const carriage = motionValue(0)
  const follower = motionValue(0)
  const breadth = motionValue(0)
  const pressure = motionValue(0)
  let slots: readonly SegmentSlot[] = []
  let trackWidth = 0
  let selected = 0
  let reduced = false
  let gesture: Gesture | null = null
  let phase: SegmentPresentation['phase'] = 'idle'
  let revision = 0
  let disposed = false

  const shape = () => {
    const minimumWidth = Math.min((slots[selected]?.width ?? 0) * 0.5, Math.max(0, trackWidth - 6))
    const left = Math.min(
      trackWidth - 3 - minimumWidth,
      Math.max(3, Math.min(carriage.get(), follower.get()) - breadth.get() / 2)
    )
    const right = Math.max(
      left + minimumWidth,
      Math.min(trackWidth - 3, Math.max(carriage.get(), follower.get()) + breadth.get() / 2)
    )
    const stretch = Math.abs(carriage.get() - follower.get())
    return {
      left,
      right,
      inset: reduced ? 3 : 3 + pressure.get() + Math.min(2.5, stretch * 0.025),
      phase
    }
  }
  const publish = () => {
    if (!disposed && trackWidth > 0) paint(shape())
  }
  const subscriptions = [carriage, follower, breadth, pressure].map((value) =>
    value.on('change', publish)
  )
  const stop = () => {
    revision += 1
    carriage.stop()
    follower.stop()
    breadth.stop()
    pressure.stop()
  }
  const jump = () => {
    stop()
    const slot = slots[selected]
    if (!slot) return
    phase = 'idle'
    carriage.jump(slot.center)
    follower.jump(slot.center)
    breadth.jump(slot.width)
    pressure.jump(0)
    publish()
  }
  const settle = (velocity?: number) => {
    const slot = slots[selected]
    if (!slot) return
    if (reduced) {
      jump()
      return
    }
    const headVelocity = velocity ?? carriage.getVelocity()
    const tailVelocity = velocity ?? follower.getVelocity()
    stop()
    const currentRevision = revision
    phase = 'settling'
    publish()
    const thrown = velocity !== undefined && Math.abs(velocity) > 180
    const animations = [
      animate(carriage, slot.center, {
        type: 'spring',
        stiffness: thrown ? 520 : 980,
        damping: thrown ? 29 : 52,
        mass: 0.85,
        velocity: headVelocity
      }),
      animate(follower, slot.center, {
        type: 'spring',
        stiffness: thrown ? 340 : 250,
        damping: thrown ? 25 : 28,
        mass: 0.9,
        velocity: tailVelocity
      }),
      animate(breadth, slot.width, { type: 'spring', stiffness: 460, damping: 29 }),
      animate(pressure, 0, { type: 'spring', stiffness: 420, damping: 26, velocity: 10 })
    ]
    void Promise.all(animations).then(() => {
      if (disposed || currentRevision !== revision || gesture) return
      phase = 'idle'
      publish()
    })
  }
  const choose = (index: number, velocity?: number) => {
    if (disposed || !slots[index]) return
    const changed = selected !== index
    selected = index
    settle(velocity)
    if (changed) commit(index)
  }
  const cancel = () => {
    if (!gesture) return
    gesture = null
    settle()
  }

  return {
    configure(nextSlots: readonly SegmentSlot[], width: number, index: number, reduce: boolean) {
      if (disposed) return
      const geometryChanged =
        trackWidth !== width ||
        slots.length !== nextSlots.length ||
        slots.some(
          (slot, i) => slot.center !== nextSlots[i].center || slot.width !== nextSlots[i].width
        )
      const externalChange = selected !== index
      const reduceChanged = reduced !== reduce
      slots = nextSlots
      trackWidth = width
      selected = index
      reduced = reduce
      if (geometryChanged || externalChange) {
        gesture = null
        jump()
      } else if (reduceChanged && reduced) {
        // Keep the gesture's semantic intent, but remove all elastic presentation.
        if (gesture) {
          stop()
          const last = gesture.samples.at(-1) ?? gesture.origin
          const width = slots[selected].width
          const center = Math.max(
            3 + width / 2,
            Math.min(trackWidth - 3 - width / 2, gesture.center + last.x - gesture.origin.x)
          )
          gesture = { ...gesture, width }
          carriage.jump(center)
          follower.jump(center)
          breadth.jump(width)
          pressure.jump(0)
          publish()
        } else jump()
      }
    },
    select(index: number) {
      gesture = null
      choose(index)
    },
    down(point: SegmentPointer, option: number): boolean {
      if (disposed || gesture || !slots.length) return false
      const frame = shape()
      const canDrag = point.x >= frame.left && point.x <= frame.right
      if (canDrag) {
        stop()
        if (!reduced) pressure.set(0.65)
      }
      gesture = {
        origin: point,
        option,
        canDrag,
        center: (frame.left + frame.right) / 2,
        width: frame.right - frame.left,
        samples: [point],
        dragging: false
      }
      phase = 'pressed'
      publish()
      return true
    },
    move(point: SegmentPointer) {
      const active = gesture
      if (!active || point.id !== active.origin.id) return
      const dx = point.x - active.origin.x
      const dy = point.y - active.origin.y
      if (!active.dragging && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        cancel()
        return
      }
      active.samples.push(point)
      while (active.samples.length > 2 && point.time - active.samples[0].time > 110)
        active.samples.shift()
      if (!active.canDrag || (!active.dragging && Math.abs(dx) < 5)) return
      active.dragging = true
      phase = 'dragging'
      const target = resistSegment(active.center + dx, active.width, trackWidth)
      const center = reduced
        ? Math.max(
            3 + active.width / 2,
            Math.min(trackWidth - 3 - active.width / 2, active.center + dx)
          )
        : target.center
      carriage.set(center)
      follower.set(center)
      breadth.set(reduced ? active.width : target.width)
      publish()
    },
    up(point: SegmentPointer) {
      const active = gesture
      if (!active || point.id !== active.origin.id) return
      gesture = null
      if (active.dragging) {
        active.samples.push(point)
        const velocity = segmentReleaseVelocity(active.samples, point.time)
        const frame = shape()
        choose(segmentLanding(slots, (frame.left + frame.right) / 2, velocity), velocity)
      } else if (
        Math.abs(point.x - active.origin.x) <= 10 &&
        Math.abs(point.y - active.origin.y) <= 10
      ) {
        choose(active.option)
      } else settle()
    },
    cancel,
    dispose() {
      disposed = true
      gesture = null
      stop()
      subscriptions.forEach((unsubscribe) => unsubscribe())
      carriage.destroy()
      follower.destroy()
      breadth.destroy()
      pressure.destroy()
    }
  }
}
