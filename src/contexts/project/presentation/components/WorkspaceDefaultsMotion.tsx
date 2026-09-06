import {
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref
} from 'react'
import { useToolbarUtilityButtonMotion } from '../../../../presentation/shared/hooks/useToolbarUtilityButtonMotion'
import { usePrefersReducedMotion } from '../../../../presentation/shared/hooks/usePrefersReducedMotion'
import { createSpringProgressMotionController } from '../../../../presentation/shared/motion/springProgressMotion'

export function WorkspaceDefaultsButton({
  className,
  buttonRef,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly buttonRef?: Ref<HTMLButtonElement> }) {
  const ref = useRef<HTMLButtonElement>(null)
  const motion = useToolbarUtilityButtonMotion(ref)
  useImperativeHandle(buttonRef, () => ref.current as HTMLButtonElement)
  return (
    <button
      {...motion}
      {...props}
      type="button"
      ref={ref}
      className={`workspace-defaults-button ${className ?? ''}`}
    />
  )
}

interface Row {
  readonly id: string
  readonly content: ReactNode
}
interface RetainedRow extends Row {
  readonly present: boolean
  readonly initial: boolean
}
export function WorkspaceDefaultsRows({ rows }: { readonly rows: readonly Row[] }) {
  const [rendered, setRendered] = useState<{
    source: readonly Row[]
    rows: readonly RetainedRow[]
  }>(() => ({ source: rows, rows: rows.map((row) => ({ ...row, present: true, initial: true })) }))
  let entries = rendered.rows
  if (rendered.source !== rows) {
    const current = new Map(rows.map((row) => [row.id, row]))
    entries = [
      ...rendered.rows.map((row) => ({
        ...row,
        ...current.get(row.id),
        present: current.has(row.id)
      })),
      ...rows
        .filter((row) => !rendered.rows.some((old) => old.id === row.id))
        .map((row) => ({ ...row, present: true, initial: false }))
    ]
    setRendered({ source: rows, rows: entries })
  }
  return (
    <div className="workspace-defaults-rows">
      {entries.map((row) => (
        <MotionRow
          key={row.id}
          present={row.present}
          initial={row.initial}
          onExit={() =>
            setRendered((current) => ({
              ...current,
              rows: current.rows.filter((item) => item.id !== row.id || item.present)
            }))
          }
        >
          {row.content}
        </MotionRow>
      ))}
    </div>
  )
}

function MotionRow({
  children,
  present,
  initial,
  onExit
}: {
  readonly children: ReactNode
  readonly present: boolean
  readonly initial: boolean
  readonly onExit: () => void
}) {
  const outer = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  const reduced = usePrefersReducedMotion()
  const controller = useMemo(
    () =>
      createSpringProgressMotionController({
        dynamics: { dampingRatio: 1, response: 0.3 },
        stateAttribute: 'data-defaults-row-motion',
        clear: (root) => {
          ;['height', 'opacity', 'transform'].forEach((property) =>
            root.style.removeProperty(property)
          )
        }
      }),
    []
  )
  useLayoutEffect(() => {
    const height = content.current?.getBoundingClientRect().height ?? 0
    controller.intentChanged(outer.current, {
      visible: present,
      reducedMotion: reduced || (initial && !mounted.current),
      onSettled: () => {
        if (!present) onExit()
      },
      present: (root, progress, state) => {
        root.style.setProperty('height', state === 'open' ? 'auto' : `${height * progress}px`)
        root.style.setProperty('opacity', `${progress}`)
        root.style.setProperty('transform', `translateY(${(1 - progress) * -6}px)`)
      }
    })
    mounted.current = true
  }, [controller, initial, onExit, present, reduced])
  useLayoutEffect(
    () => () => {
      controller.dispose()
      // Effect replay starts a fresh presentation owner for the same mounted rows.
      // Keep the initial full-height projection on every setup of that owner.
      mounted.current = false
    },
    [controller]
  )
  return (
    <div
      ref={outer}
      className="workspace-defaults-row-motion"
      inert={!present}
      aria-hidden={!present || undefined}
    >
      <div ref={content}>{children}</div>
    </div>
  )
}
