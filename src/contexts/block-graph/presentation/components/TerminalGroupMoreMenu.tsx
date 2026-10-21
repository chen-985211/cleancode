import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { TooltipLabel } from '../../../../presentation/shared/components/Tooltip'
import { AnchoredSurfaceMotion } from '../../../../presentation/shared/components/SurfaceMotion'
import { useOutsidePointerDismiss } from '../../../../presentation/shared/hooks/useOutsidePointerDismiss'
import {
  focusChoiceMenu,
  navigateChoiceMenu
} from '../../../../presentation/shared/menus/choiceMenuNavigation'
import { GroupDissolveIcon, GroupRenameIcon } from './TerminalGroupIcons'

export function TerminalGroupMoreMenu({
  name,
  onRename,
  onDissolve
}: {
  readonly name: string
  readonly onRename: () => void
  readonly onDissolve: () => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const close = () => {
    setOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }
  useOutsidePointerDismiss({
    active: open,
    isInside: (target) =>
      Boolean(rootRef.current?.contains(target) || menuRef.current?.contains(target)),
    onDismiss: close,
    pointerPolicy: 'consume'
  })
  useEffect(() => {
    if (open) focusChoiceMenu(menuRef.current, 'first')
  }, [open])
  useLayoutEffect(() => {
    const anchor = triggerRef.current
    const menu = menuRef.current
    if (!open || !anchor || !menu) return
    let frame: number | null = null
    const place = () => {
      frame = null
      if (anchor.closest('[inert], [aria-hidden="true"]')) {
        setOpen(false)
        return
      }
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(180, window.innerWidth - 24)
      const height = menu.offsetHeight
      const upward = rect.bottom + 6 + height > window.innerHeight - 12 && rect.top > height + 18
      menu.style.width = `${width}px`
      menu.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`
      menu.style.top = `${Math.max(12, Math.min(upward ? rect.top - height - 6 : rect.bottom + 6, window.innerHeight - height - 12))}px`
      menu.style.transformOrigin = upward ? 'bottom right' : 'top right'
      menu.dataset.side = upward ? 'top' : 'bottom'
    }
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(place)
    }
    const mutations = new MutationObserver(schedule)
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    for (let element: HTMLElement | null = anchor; element; element = element.parentElement) {
      mutations.observe(element, {
        attributes: true,
        attributeFilter: ['style', 'class', 'inert', 'aria-hidden']
      })
      resize?.observe(element)
    }
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, true)
    place()
    return () => {
      mutations.disconnect()
      resize?.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('scroll', schedule, true)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [open])
  return (
    <div className="terminal-group-node__more nodrag" ref={rootRef}>
      <TooltipLabel content={t('group.action.more')}>
        <button
          ref={triggerRef}
          type="button"
          className="terminal-group-node__action"
          data-control-surface="raised"
          aria-label={t('group.namedAction', { groupName: name, action: t('group.action.more') })}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen(!open)}
        >
          <DotsThreeIcon size={18} weight="bold" aria-hidden="true" />
        </button>
      </TooltipLabel>
      <AnchoredSurfaceMotion
        ref={menuRef}
        id={menuId}
        open={open}
        portalContainer={document.body}
        springPreset="directional-menu"
        className="terminal-group-node__more-menu anchored-surface-motion directional-menu-surface nodrag nopan nowheel"
        role="menu"
        aria-label={t('group.namedAction', { groupName: name, action: t('group.action.more') })}
        data-shortcut-capture=""
        onKeyDown={(event) => navigateChoiceMenu(event, close)}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            close()
            onRename()
          }}
        >
          <GroupRenameIcon size={16} />
          {t('group.action.rename')}
        </button>
        <TooltipLabel content={t('group.action.dissolveDescription')}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close()
              onDissolve()
            }}
          >
            <GroupDissolveIcon size={16} />
            {t('group.action.dissolve')}
          </button>
        </TooltipLabel>
      </AnchoredSurfaceMotion>
    </div>
  )
}
