import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { AnchoredSurfaceMotion } from '../../../../presentation/shared/components/SurfaceMotion'
import { useMenuOptionHighlightMotion } from '../../../../presentation/shared/hooks/useMenuOptionHighlightMotion'
import { useOutsidePointerDismiss } from '../../../../presentation/shared/hooks/useOutsidePointerDismiss'

export function IssueMenuSelect({
  label,
  value,
  options,
  onChange
}: {
  readonly label: string
  readonly value: string
  readonly options: readonly { readonly value: string; readonly label: string }[]
  readonly onChange: (value: string) => void
}) {
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const initialFocus = useRef<'container' | 'first' | 'last'>('container')
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({ top: 0, left: 0 })
  const { highlightRef, interactionProps } = useMenuOptionHighlightMotion()
  function close(restore: boolean) {
    setOpen(false)
    if (restore) anchor.current?.focus({ preventScroll: true })
  }
  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const rect = anchor.current.getBoundingClientRect()
    const width = Math.min(300, Math.max(200, rect.width), window.innerWidth - 32)
    setPosition({
      top: rect.bottom + 6,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      width,
      maxHeight: Math.max(48, Math.min(320, window.innerHeight - rect.bottom - 22))
    })
    const items = Array.from(
      popup.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []
    )
    const target =
      initialFocus.current === 'first'
        ? items[0]
        : initialFocus.current === 'last'
          ? items[items.length - 1]
          : popup.current
    target?.focus({ preventScroll: true })
  }, [open])
  useOutsidePointerDismiss({
    active: open,
    pointerPolicy: 'consume',
    isInside: (target) =>
      Boolean(anchor.current?.contains(target) || popup.current?.contains(target)),
    onDismiss: () => close(false)
  })
  useEffect(() => {
    if (!open) return
    const dismiss = () => close(false)
    const scroll = (event: Event) => {
      if (!popup.current?.contains(event.target as Node)) close(false)
    }
    window.addEventListener('resize', dismiss)
    document.addEventListener('scroll', scroll, true)
    return () => {
      window.removeEventListener('resize', dismiss)
      document.removeEventListener('scroll', scroll, true)
    }
  }, [open])
  return (
    <>
      <button
        ref={anchor}
        className="project-issues__select directional-menu-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          initialFocus.current = 'container'
          setOpen(!open)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            event.stopPropagation()
            initialFocus.current = event.key === 'ArrowDown' ? 'first' : 'last'
            setOpen(true)
          }
        }}
      >
        <span>{options.find((option) => option.value === value)?.label ?? value}</span>
        <CaretDownIcon size={12} aria-hidden="true" />
      </button>
      <AnchoredSurfaceMotion
        ref={popup}
        id={id}
        open={open}
        portalContainer={document.body}
        springPreset="directional-menu"
        className="project-issues-menu anchored-surface-motion directional-menu-surface menu-option-highlight-container"
        data-side="bottom"
        data-shortcut-capture=""
        style={position}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        {...interactionProps}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') event.preventDefault()
            close(true)
            return
          }
          const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
          )
          const index = items.indexOf(document.activeElement as HTMLButtonElement)
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            items[index]?.click()
            return
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const next =
              event.key === 'Home' || (event.key === 'ArrowDown' && index < 0)
                ? 0
                : event.key === 'End' || (event.key === 'ArrowUp' && index < 0)
                  ? items.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
            items[next]?.focus()
          }
        }}
      >
        <span ref={highlightRef} aria-hidden="true" className="menu-option-highlight-motion" />
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={option.value === value}
            className="menu-option-highlight-target"
            data-menu-option-highlight
            onClick={() => {
              onChange(option.value)
              close(true)
            }}
          >
            <span>{option.label}</span>
            {option.value === value ? <CheckIcon size={15} aria-hidden="true" /> : null}
          </button>
        ))}
      </AnchoredSurfaceMotion>
    </>
  )
}
