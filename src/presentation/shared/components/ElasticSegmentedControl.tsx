import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent
} from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { createElasticSegmentMotion, type SegmentPointer } from '../motion/elasticSegmentMotion'
import '../styles/elastic-segmented-control.css'

interface SegmentOption<Value extends string> {
  readonly value: Value
  readonly label: string
  readonly description?: string
}
interface ElasticSegmentedControlProps<Value extends string> {
  readonly options: readonly SegmentOption<Value>[]
  readonly value: Value
  readonly onChange: (value: Value) => void
  readonly labelledBy: string
  readonly describedBy?: string
  readonly disabled?: boolean
}

export function ElasticSegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  labelledBy,
  describedBy,
  disabled = false
}: ElasticSegmentedControlProps<Value>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<ReturnType<typeof createElasticSegmentMotion> | null>(null)
  const measureRef = useRef<(() => void) | null>(null)
  const pointerRef = useRef<number | null>(null)
  const reduced = usePrefersReducedMotion()
  const latest = useRef({ options, value, onChange, reduced, disabled })
  useLayoutEffect(() => {
    latest.current = { options, value, onChange, reduced, disabled }
  })
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  )

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    let measuredWidth = 0
    const controller = createElasticSegmentMotion(
      ({ left, right, inset, phase }) => {
        root.style.setProperty('--elastic-left', `${left}px`)
        root.style.setProperty('--elastic-right', `${measuredWidth - right}px`)
        root.style.setProperty('--elastic-inset', `${inset}px`)
        root.dataset.motionState = phase
      },
      (index) => {
        const current = latest.current
        if (!current.disabled && current.options[index]) {
          current.onChange(current.options[index].value)
          if (root.contains(document.activeElement)) {
            const buttons = root.querySelectorAll<HTMLButtonElement>('[role="radio"]')
            buttons[index]?.focus({ preventScroll: true })
          }
        }
      }
    )
    controllerRef.current = controller
    const measure = () => {
      const current = latest.current
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
      measuredWidth = root.clientWidth
      controller.configure(
        buttons.map((button) => ({
          center: button.offsetLeft + button.offsetWidth / 2,
          width: button.offsetWidth
        })),
        measuredWidth,
        Math.max(
          0,
          current.options.findIndex((option) => option.value === current.value)
        ),
        current.reduced
      )
      if (current.disabled) controller.cancel()
    }
    measureRef.current = measure
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    measure()
    return () => {
      observer.disconnect()
      controller.dispose()
      controllerRef.current = null
      measureRef.current = null
    }
  }, [])
  useLayoutEffect(() => {
    measureRef.current?.()
  })

  const releasePointer = () => {
    const id = pointerRef.current
    pointerRef.current = null
    if (id !== null && rootRef.current?.hasPointerCapture?.(id))
      rootRef.current.releasePointerCapture(id)
  }
  const point = (event: PointerEvent<HTMLDivElement>): SegmentPointer => {
    const root = event.currentTarget
    const rect = root.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (root.clientWidth / (rect.width || 1)),
      y: event.clientY - rect.top,
      time: event.timeStamp,
      id: event.pointerId
    }
  }
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (rootRef.current) rootRef.current.dataset.inputMethod = 'keyboard'
    if (event.key === 'Escape') {
      if (pointerRef.current === null) return
      controllerRef.current?.cancel()
      releasePointer()
      event.stopPropagation()
      return
    }
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : step
            ? (index + step + options.length) % options.length
            : null
    if (next === null) return
    event.preventDefault()
    releasePointer()
    controllerRef.current?.select(next)
    rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div
      ref={rootRef}
      className="elastic-segment"
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      data-value={value}
      style={{ '--elastic-count': options.length, '--elastic-selected': selected } as CSSProperties}
      onPointerDown={(event) => {
        if (
          disabled ||
          event.button !== 0 ||
          event.isPrimary === false ||
          pointerRef.current !== null
        )
          return
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
          '[data-segment-index]'
        )
        if (!button) return
        measureRef.current?.()
        if (!controllerRef.current?.down(point(event), Number(button.dataset.segmentIndex))) return
        event.currentTarget.dataset.inputMethod = 'pointer'
        pointerRef.current = event.pointerId
        event.currentTarget.setPointerCapture?.(event.pointerId)
        button.focus({ preventScroll: true })
      }}
      onFocus={(event) => {
        if (pointerRef.current === null && event.target.matches(':focus-visible')) {
          event.currentTarget.dataset.inputMethod = 'keyboard'
        }
      }}
      onPointerMove={(event) => controllerRef.current?.move(point(event))}
      onPointerUp={(event) => {
        if (pointerRef.current !== event.pointerId) return
        controllerRef.current?.up(point(event))
        releasePointer()
      }}
      onPointerCancel={(event) => {
        if (pointerRef.current !== event.pointerId) return
        controllerRef.current?.cancel()
        releasePointer()
      }}
      onLostPointerCapture={(event) => {
        if (pointerRef.current !== event.pointerId) return
        pointerRef.current = null
        controllerRef.current?.cancel()
      }}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          aria-description={option.description}
          disabled={disabled}
          tabIndex={index === selected ? 0 : -1}
          data-segment-index={index}
          onClick={(event) => {
            if (event.detail === 0) controllerRef.current?.select(index)
          }}
          onKeyDown={(event) => keyDown(event, index)}
        >
          {option.label}
        </button>
      ))}
      <div className="elastic-segment__material" aria-hidden="true">
        {options.map((option) => (
          <span key={option.value}>{option.label}</span>
        ))}
      </div>
    </div>
  )
}
