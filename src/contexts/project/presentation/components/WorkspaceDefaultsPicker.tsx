import { useMenuOptionHighlightMotion } from '../../../../presentation/shared/hooks/useMenuOptionHighlightMotion'
import {
  focusChoiceMenu,
  navigateChoiceMenu
} from '../../../../presentation/shared/menus/choiceMenuNavigation'
import { useOutsidePointerDismiss } from '../../../../presentation/shared/hooks/useOutsidePointerDismiss'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties
} from 'react'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { AnchoredSurfaceMotion } from '../../../../presentation/shared/components/SurfaceMotion'
import { WorkspaceDefaultsButton } from './WorkspaceDefaultsMotion'

interface Choice {
  readonly id: string
  readonly name: string
  readonly icon?: ReactNode
  readonly selected: boolean
}
export function WorkspaceDefaultsPicker({
  label,
  groups,
  onAdd
}: {
  readonly label: string
  readonly groups: readonly {
    readonly name: string
    readonly empty: string
    readonly choices: readonly Choice[]
  }[]
  readonly onAdd: (id: string) => void
}) {
  const { highlightRef, interactionProps } = useMenuOptionHighlightMotion()
  const initialFocus = useRef<'container' | 'first' | 'last'>('container')
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const id = useId()
  const [position, setPosition] = useState<CSSProperties>({ top: 0, right: 0, maxHeight: 320 })
  function close(restore: boolean) {
    setOpen(false)
    if (restore) anchor.current?.focus({ preventScroll: true })
  }
  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const rect = anchor.current.getBoundingClientRect()
    const room = window.innerHeight - rect.bottom - 16
    setPosition({
      ...(room >= 220 ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 }),
      right: Math.max(16, window.innerWidth - rect.right),
      maxHeight: Math.max(48, Math.min(320, room >= 220 ? room : rect.top - 24))
    })
    focusChoiceMenu(popup.current, initialFocus.current)
  }, [open])
  useOutsidePointerDismiss({
    active: open,
    pointerPolicy: 'passthrough',
    isInside: (target) =>
      Boolean(popup.current?.contains(target) || anchor.current?.contains(target)),
    onDismiss: () => close(false)
  })
  useEffect(() => {
    if (!open) return
    const resize = () => setOpen(false)
    const scroll = (event: Event) => {
      if (!popup.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('resize', resize)
    document.addEventListener('scroll', scroll, true)
    return () => {
      window.removeEventListener('resize', resize)
      document.removeEventListener('scroll', scroll, true)
    }
  }, [open])
  return (
    <>
      <WorkspaceDefaultsButton
        buttonRef={anchor}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          initialFocus.current = 'container'
          setOpen((current) => !current)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          event.stopPropagation()
          initialFocus.current = event.key === 'ArrowDown' ? 'first' : 'last'
          setOpen(true)
        }}
        className="workspace-defaults-add"
      >
        <PlusIcon size={14} aria-hidden="true" />
        {label}
      </WorkspaceDefaultsButton>
      <AnchoredSurfaceMotion
        ref={popup}
        id={id}
        open={open}
        springPreset="directional-menu"
        data-side={position.bottom === undefined ? 'bottom' : 'top'}
        portalContainer={document.body}
        className="workspace-defaults-picker anchored-surface-motion directional-menu-surface menu-option-highlight-container"
        {...interactionProps}
        style={position}
        role="menu"
        tabIndex={-1}
        aria-label={label}
        onKeyDown={(event) => navigateChoiceMenu(event, () => close(true))}
      >
        <span ref={highlightRef} aria-hidden="true" className="menu-option-highlight-motion" />
        {groups.map((group) => (
          <div role="group" aria-label={group.name} key={group.name}>
            <p className="workspace-defaults-picker-heading">{group.name}</p>
            {group.choices.length ? (
              group.choices.map((choice) => (
                <button
                  className="menu-option-highlight-target"
                  data-menu-option-highlight
                  type="button"
                  role="menuitem"
                  aria-label={choice.name}
                  disabled={choice.selected}
                  key={choice.id}
                  onClick={() => {
                    onAdd(choice.id)
                    close(true)
                  }}
                >
                  {choice.icon}
                  <span>{choice.name}</span>
                  {choice.selected ? <CheckIcon size={14} aria-hidden="true" /> : null}
                </button>
              ))
            ) : (
              <p className="workspace-defaults-picker-empty">{group.empty}</p>
            )}
          </div>
        ))}
      </AnchoredSurfaceMotion>
    </>
  )
}
