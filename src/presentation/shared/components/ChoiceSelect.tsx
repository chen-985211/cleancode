import '../styles/choice-select.css'
import { focusChoiceMenu, navigateChoiceMenu } from '../menus/choiceMenuNavigation'
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { AnchoredSurfaceMotion } from '../components/SurfaceMotion'
import { useMenuOptionHighlightMotion } from '../hooks/useMenuOptionHighlightMotion'
import { useOutsidePointerDismiss } from '../hooks/useOutsidePointerDismiss'

export function ChoiceSelect({
  active = true,
  label,
  value,
  options,
  onChange,
  className = '',
  menuClassName = '',
  pointerPolicy = 'consume'
}: {
  readonly active?: boolean
  readonly menuClassName?: string
  readonly className?: string
  readonly pointerPolicy?: 'consume' | 'passthrough'
  readonly label: string
  readonly value: string
  readonly options: readonly {
    readonly value: string
    readonly label: string
    readonly disabled?: boolean
  }[]
  readonly onChange: (value: string) => void
}) {
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const initialFocus = useRef<'container' | 'first' | 'last'>('container')
  const [expanded, setExpanded] = useState(false)
  const open = active && expanded
  // A hidden owner cannot leave a portal interactive or reopen it on its next visit.
  if (!active && expanded) setExpanded(false)
  const [position, setPosition] = useState<CSSProperties>({ top: 0, left: 0 })
  const { highlightRef, interactionProps } = useMenuOptionHighlightMotion()
  function close(restore: boolean) {
    setExpanded(false)
    if (restore) anchor.current?.focus({ preventScroll: true })
  }
  useLayoutEffect(() => {
    if (!open) return
    const positionMenu = () => {
      if (!anchor.current) return
      const rect = anchor.current.getBoundingClientRect()
      const width = Math.min(300, Math.max(200, rect.width), window.innerWidth - 32)
      const below = window.innerHeight - rect.bottom - 22
      const upward = below < 180 && rect.top > below
      setPosition({
        ...(upward ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        width,
        maxHeight: Math.max(48, Math.min(320, upward ? rect.top - 22 : below))
      })
    }
    const scroll = (event: Event) => {
      if (!popup.current?.contains(event.target as Node)) positionMenu()
    }
    positionMenu()
    focusChoiceMenu(popup.current, initialFocus.current)
    window.addEventListener('resize', positionMenu)
    document.addEventListener('scroll', scroll, true)
    return () => {
      window.removeEventListener('resize', positionMenu)
      document.removeEventListener('scroll', scroll, true)
    }
  }, [open])
  useOutsidePointerDismiss({
    active: open,
    pointerPolicy,
    isInside: (target) =>
      Boolean(anchor.current?.contains(target) || popup.current?.contains(target)),
    onDismiss: () => close(false)
  })

  return (
    <>
      <button
        ref={anchor}
        className={`choice-select-trigger directional-menu-trigger ${className}`}
        type="button"
        disabled={!active}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          initialFocus.current = 'container'
          setExpanded(!open)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            event.stopPropagation()
            initialFocus.current = event.key === 'ArrowDown' ? 'first' : 'last'
            setExpanded(true)
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
        className={`choice-select-menu anchored-surface-motion directional-menu-surface menu-option-highlight-container ${menuClassName}`}
        data-side={position.bottom === undefined ? 'bottom' : 'top'}
        data-shortcut-capture=""
        style={position}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        {...interactionProps}
        onKeyDown={(event) => navigateChoiceMenu(event, () => close(true))}
      >
        <span ref={highlightRef} aria-hidden="true" className="menu-option-highlight-motion" />
        {options.map((option) => (
          <button
            key={option.value}
            disabled={option.disabled}
            data-choice-value={option.value}
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
