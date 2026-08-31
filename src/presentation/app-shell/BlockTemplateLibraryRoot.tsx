import { FolderSimplePlusIcon } from '@phosphor-icons/react/dist/csr/FolderSimplePlus'
import { GlobeHemisphereWestIcon } from '@phosphor-icons/react/dist/csr/GlobeHemisphereWest'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { PlayIcon } from '@phosphor-icons/react/dist/csr/Play'
import { StarIcon } from '@phosphor-icons/react/dist/csr/Star'
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'

import type {
  BlockTemplateScope,
  BlockTemplateSnapshot
} from '../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import { useI18n } from '../i18n/useI18n'
import { OverlaySurfaceMotion } from './AppShellSurfaceMotion'
import { TooltipLabel } from '../shared/components/Tooltip'
import { useInterruptibleSurfaceFocusRestore } from './useInterruptibleSurfaceFocusRestore'
import { useSelectionIndicatorMotion } from '../shared/hooks/useSelectionMotion'
import { useToolbarUtilityButtonMotion } from './useToolbarUtilityButtonMotion'

type LibraryScopeKind = BlockTemplateScope['type']

export function BlockTemplateLibraryRoot({
  currentProjectId,
  isDesktopRuntime,
  onBeginPlacement
}: {
  readonly currentProjectId: string | null
  readonly isDesktopRuntime: boolean
  readonly onBeginPlacement: (template: BlockTemplateSnapshot, runAfterPlacement: boolean) => void
}) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [scopeKind, setScopeKind] = useState<LibraryScopeKind>('project')
  const [templates, setTemplates] = useState<readonly BlockTemplateSnapshot[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadRevision, setLoadRevision] = useState(0)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const triggerMotionProps = useToolbarUtilityButtonMotion(triggerRef)
  const [scopeSelectionContainerRef, scopeSelectionIndicatorRef] =
    useSelectionIndicatorMotion(scopeKind)
  const { beginFocusRestore, cancelFocusRestore, completeFocusRestore } =
    useInterruptibleSurfaceFocusRestore(dialogRef, triggerRef)
  const closeLibrary = useCallback((): void => {
    beginFocusRestore()
    setIsOpen(false)
    setEditingTemplateId(null)
    setDeleteTemplateId(null)
    setSearchQuery('')
  }, [beginFocusRestore])
  const scope = useMemo(
    () => resolveScope(scopeKind, currentProjectId),
    [currentProjectId, scopeKind]
  )

  useEffect(() => {
    if (!isOpen) return undefined

    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeLibrary()
    }
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [closeLibrary, isOpen])

  useEffect(() => {
    if (!isOpen || !scope || !window.cleancode?.listBlockTemplates) return undefined

    let active = true
    void window.cleancode
      .listBlockTemplates({ scope })
      .then((result) => {
        if (active) setTemplates(result)
      })
      .catch(() => {
        if (active) setErrorMessage(t('templates.loadFailed'))
      })

    return () => {
      active = false
    }
  }, [isOpen, loadRevision, scope, t])

  const visibleTemplates = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
    if (!normalizedQuery) return templates
    return templates.filter((template) =>
      `${template.name}\n${template.description}`.toLocaleLowerCase().includes(normalizedQuery)
    )
  }, [searchQuery, templates])

  return (
    <>
      <TooltipLabel content={t('templates.title')} side="bottom">
        <button
          ref={triggerRef}
          className="block-template-library-trigger app-shell-utility-button"
          type="button"
          aria-label={t('templates.title')}
          aria-controls="block-template-library-dialog"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          disabled={!isDesktopRuntime}
          {...triggerMotionProps}
          onClick={() => {
            cancelFocusRestore()
            setErrorMessage(null)
            setScopeKind(currentProjectId ? 'project' : 'global')
            setIsOpen(true)
          }}
        >
          <StarIcon size={18} weight="bold" aria-hidden="true" />
        </button>
      </TooltipLabel>
      <OverlaySurfaceMotion
        ref={dialogRef}
        open={isOpen}
        springPreset="drawer-right"
        onExitComplete={completeFocusRestore}
        id="block-template-library-dialog"
        className="block-template-library-backdrop overlay-surface-motion overlay-surface-motion--drawer-right"
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-template-library-title"
        onMouseDown={closeFromBackdrop}
      >
        <aside className="block-template-library-drawer overlay-surface-motion__content">
          <header className="block-template-library-header">
            <h2 id="block-template-library-title">{t('templates.title')}</h2>
            <TooltipLabel content={t('templates.close')} side="left">
              <button
                ref={closeButtonRef}
                className="block-template-library-close"
                type="button"
                aria-label={t('templates.close')}
                onClick={closeLibrary}
              >
                <XIcon size={18} weight="bold" aria-hidden="true" />
              </button>
            </TooltipLabel>
          </header>
          <div className="block-template-library-controls">
            <div
              ref={scopeSelectionContainerRef}
              className="block-template-library-tabs"
              role="tablist"
            >
              <span
                ref={scopeSelectionIndicatorRef}
                className="selection-motion-indicator block-template-library-tabs__selection"
                data-selection-motion-target={scopeKind}
                aria-hidden="true"
              />
              <button
                type="button"
                data-selection-motion-option="project"
                role="tab"
                aria-selected={scopeKind === 'project'}
                disabled={!currentProjectId}
                onClick={() => {
                  setErrorMessage(null)
                  setScopeKind('project')
                }}
              >
                {t('templates.scope.project')}
              </button>
              <button
                type="button"
                data-selection-motion-option="global"
                role="tab"
                aria-selected={scopeKind === 'global'}
                onClick={() => {
                  setErrorMessage(null)
                  setScopeKind('global')
                }}
              >
                {t('templates.scope.global')}
              </button>
            </div>
            <label className="block-template-library-search">
              <MagnifyingGlassIcon size={15} aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                aria-label={t('templates.search')}
                placeholder={t('templates.search')}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
          </div>
          <div className="block-template-library-list">
            {errorMessage ? (
              <div className="block-template-library-error" role="alert">
                <span>{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null)
                    setLoadRevision((revision) => revision + 1)
                  }}
                >
                  {t('templates.retry')}
                </button>
              </div>
            ) : null}
            {!errorMessage && visibleTemplates.length === 0 ? (
              <p className="block-template-library-empty">
                {searchQuery ? t('templates.searchEmpty') : t('templates.empty')}
              </p>
            ) : null}
            {visibleTemplates.map((template) => (
              <TemplateLibraryItem
                key={template.id}
                template={template}
                currentProjectId={currentProjectId}
                isEditing={editingTemplateId === template.id}
                isDeletePending={deleteTemplateId === template.id}
                onBeginPlacement={(runAfterPlacement) => {
                  onBeginPlacement(template, runAfterPlacement)
                  closeLibrary()
                }}
                onCancelDelete={() => setDeleteTemplateId(null)}
                onCancelEdit={() => setEditingTemplateId(null)}
                onDelete={() => void deleteTemplate(template)}
                onEdit={() => setEditingTemplateId(template.id)}
                onMove={() => void moveTemplate(template)}
                onRequestDelete={() => setDeleteTemplateId(template.id)}
                onSave={(name, description) => void updateTemplate(template, name, description)}
              />
            ))}
          </div>
        </aside>
      </OverlaySurfaceMotion>
    </>
  )

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) closeLibrary()
  }

  async function updateTemplate(
    template: BlockTemplateSnapshot,
    name: string,
    description: string
  ): Promise<void> {
    try {
      const updated = await window.cleancode?.updateBlockTemplate({
        templateId: template.id,
        name,
        description
      })
      if (!updated) return
      setTemplates((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setEditingTemplateId(null)
    } catch {
      setErrorMessage(t('templates.updateFailed'))
    }
  }

  async function moveTemplate(template: BlockTemplateSnapshot): Promise<void> {
    const nextScope =
      template.scope.type === 'project'
        ? ({ type: 'global' } as const)
        : currentProjectId
          ? ({ type: 'project', projectId: currentProjectId } as const)
          : null
    if (!nextScope) return

    try {
      await window.cleancode?.moveBlockTemplate({
        templateId: template.id,
        scope: nextScope
      })
      setTemplates((items) => items.filter((item) => item.id !== template.id))
    } catch {
      setErrorMessage(t('templates.moveFailed'))
    }
  }

  async function deleteTemplate(template: BlockTemplateSnapshot): Promise<void> {
    try {
      await window.cleancode?.deleteBlockTemplate({ templateId: template.id })
      setTemplates((items) => items.filter((item) => item.id !== template.id))
      setDeleteTemplateId(null)
    } catch {
      setErrorMessage(t('templates.deleteFailed'))
    }
  }
}

function TemplateLibraryItem({
  currentProjectId,
  isDeletePending,
  isEditing,
  onBeginPlacement,
  onCancelDelete,
  onCancelEdit,
  onDelete,
  onEdit,
  onMove,
  onRequestDelete,
  onSave,
  template
}: {
  readonly currentProjectId: string | null
  readonly isDeletePending: boolean
  readonly isEditing: boolean
  readonly onBeginPlacement: (runAfterPlacement: boolean) => void
  readonly onCancelDelete: () => void
  readonly onCancelEdit: () => void
  readonly onDelete: () => void
  readonly onEdit: () => void
  readonly onMove: () => void
  readonly onRequestDelete: () => void
  readonly onSave: (name: string, description: string) => void
  readonly template: BlockTemplateSnapshot
}) {
  const { t } = useI18n()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description)
  const typeLabel = t(`templates.type.${template.type}`)
  const renameLabel = t('templates.rename', { name: template.name })
  const moveLabel = t(
    template.scope.type === 'project' ? 'templates.moveToGlobal' : 'templates.moveToProject',
    { name: template.name }
  )
  const deleteLabel = t('templates.delete', { name: template.name })

  return (
    <article className="block-template-card" data-template-type={template.type}>
      {isEditing ? (
        <form
          className="block-template-card-edit"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) onSave(name.trim(), description.trim())
          }}
        >
          <label>
            <span>{t('templates.name')}</span>
            <input
              aria-label={t('templates.name')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            <span>{t('templates.templateDescription')}</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div>
            <button type="button" onClick={onCancelEdit}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={!name.trim()}>
              {t('templates.saveName')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="block-template-card-heading">
            <div>
              <span className="block-template-card-type">{typeLabel}</span>
              <h3>{template.name}</h3>
              {template.description ? <p>{template.description}</p> : null}
            </div>
            <div className="block-template-card-tools">
              <TooltipLabel content={renameLabel}>
                <button type="button" aria-label={renameLabel} onClick={onEdit}>
                  <PencilSimpleIcon size={14} weight="bold" aria-hidden="true" />
                </button>
              </TooltipLabel>
              <TooltipLabel content={moveLabel}>
                <button
                  type="button"
                  aria-label={moveLabel}
                  disabled={template.scope.type === 'global' && !currentProjectId}
                  onClick={onMove}
                >
                  {template.scope.type === 'project' ? (
                    <GlobeHemisphereWestIcon size={14} weight="bold" aria-hidden="true" />
                  ) : (
                    <FolderSimplePlusIcon size={14} weight="bold" aria-hidden="true" />
                  )}
                </button>
              </TooltipLabel>
              <TooltipLabel content={deleteLabel}>
                <button type="button" aria-label={deleteLabel} onClick={onRequestDelete}>
                  <TrashIcon size={14} weight="bold" aria-hidden="true" />
                </button>
              </TooltipLabel>
            </div>
          </div>
          {isDeletePending ? (
            <div className="block-template-card-delete">
              <span>{t('templates.deleteQuestion')}</span>
              <button type="button" onClick={onCancelDelete}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={onDelete}>
                {t('templates.confirmDelete')}
              </button>
            </div>
          ) : (
            <div className="block-template-card-actions">
              <button
                type="button"
                aria-label={t('templates.placeNamed', { name: template.name })}
                onClick={() => onBeginPlacement(false)}
              >
                {t('templates.place')}
              </button>
              <button
                type="button"
                aria-label={t('templates.placeRunNamed', { name: template.name })}
                onClick={() => onBeginPlacement(true)}
              >
                <PlayIcon size={14} weight="fill" aria-hidden="true" />
                {t('templates.placeAndRun')}
              </button>
            </div>
          )}
        </>
      )}
    </article>
  )
}

function resolveScope(
  scopeKind: LibraryScopeKind,
  currentProjectId: string | null
): BlockTemplateScope | null {
  if (scopeKind === 'global') return { type: 'global' }
  return currentProjectId ? { type: 'project', projectId: currentProjectId } : null
}
