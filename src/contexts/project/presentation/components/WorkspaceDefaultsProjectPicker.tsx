import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { FolderIcon } from '@phosphor-icons/react/dist/csr/Folder'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { AnchoredSurfaceMotion } from '../../../../presentation/shared/components/SurfaceMotion'
import { useOutsidePointerDismiss } from '../../../../presentation/shared/hooks/useOutsidePointerDismiss'
import { WorkspaceDefaultsButton } from './WorkspaceDefaultsMotion'

interface ProjectChoice {
  readonly id: string
  readonly name: string
  readonly directory: string
}

export function WorkspaceDefaultsProjectPicker({
  projects,
  selected,
  onSelect
}: {
  readonly projects: readonly ProjectChoice[]
  readonly selected: ProjectChoice
  readonly onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({ top: 0, left: 0 })
  function close(restoreFocus: boolean) {
    setOpen(false)
    if (restoreFocus) anchor.current?.focus({ preventScroll: true })
  }
  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const rect = anchor.current.getBoundingClientRect()
    const width = Math.min(320, window.innerWidth - 32)
    const below = window.innerHeight - rect.bottom - 24
    const upward = below < 180 && rect.top > below
    setPosition({
      width,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      ...(upward ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      maxHeight: Math.max(48, Math.min(360, upward ? rect.top - 24 : below))
    })
    popup.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus({ preventScroll: true })
  }, [open, selected.id])
  useOutsidePointerDismiss({
    active: open,
    pointerPolicy: 'passthrough',
    isInside: (target) =>
      Boolean(anchor.current?.contains(target) || popup.current?.contains(target)),
    onDismiss: () => close(false)
  })
  useEffect(() => {
    if (!open) return
    const resize = () => close(false)
    const scroll = (event: Event) => {
      if (!popup.current?.contains(event.target as Node)) close(false)
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
        className="workspace-defaults-project-trigger"
        aria-label={t('workspaceDefaults.switchProject', { name: selected.name })}
        title={selected.directory}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            event.stopPropagation()
            setOpen(true)
          }
        }}
      >
        <FolderIcon size={16} aria-hidden="true" />
        <span>{selected.name}</span>
        <CaretDownIcon size={12} aria-hidden="true" />
      </WorkspaceDefaultsButton>
      <AnchoredSurfaceMotion
        ref={popup}
        id={id}
        open={open}
        portalContainer={document.body}
        springPreset={position.bottom === undefined ? 'anchored-top-left' : 'anchored-bottom-left'}
        className="workspace-defaults-project-menu anchored-surface-motion"
        style={position}
        role="menu"
        aria-label={t('workspaceDefaults.project')}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') event.preventDefault()
            event.stopPropagation()
            close(true)
          }
          const options = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
          ]
          const index = options.indexOf(document.activeElement as HTMLButtonElement)
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            options[index]?.click()
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            event.stopPropagation()
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
            options[next]?.focus()
          }
        }}
      >
        {projects.map((project) => (
          <button
            type="button"
            role="menuitemradio"
            aria-label={project.name}
            aria-checked={project.id === selected.id}
            aria-describedby={`${id}-${project.id}`}
            key={project.id}
            onClick={() => {
              onSelect(project.id)
              close(true)
            }}
          >
            <FolderIcon size={18} aria-hidden="true" />
            <span className="workspace-defaults-project-copy">
              <strong>{project.name}</strong>
              <small id={`${id}-${project.id}`} title={project.directory}>
                {project.directory}
              </small>
            </span>
            {project.id === selected.id ? <CheckIcon size={15} aria-hidden="true" /> : null}
          </button>
        ))}
      </AnchoredSurfaceMotion>
    </>
  )
}
