import { FolderInput, Globe2, Pencil, Play, Search, Star, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'

import type {
  BlockTemplateScope,
  BlockTemplateSnapshot
} from '../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import { useI18n } from './i18n/useI18n'
import { TooltipLabel } from './Tooltip'

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
  const scope = useMemo(
    () => resolveScope(scopeKind, currentProjectId),
    [currentProjectId, scopeKind]
  )

  useEffect(() => {
    if (!isOpen) return undefined

    closeButtonRef.current?.focus()
    const backgroundRegions = Array.from(
      document.querySelectorAll<HTMLElement>('.project-sidebar, .app-shell__workspace')
    )
    for (const region of backgroundRegions) region.inert = true

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeLibrary()
    }
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      for (const region of backgroundRegions) region.inert = false
    }
  }, [isOpen])

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
          className="block-template-library-trigger"
          type="button"
          aria-label={t('templates.title')}
          aria-controls="block-template-library-dialog"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          disabled={!isDesktopRuntime}
          onClick={() => {
            setErrorMessage(null)
            setScopeKind(currentProjectId ? 'project' : 'global')
            setIsOpen(true)
          }}
        >
          <Star size={18} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </TooltipLabel>
      {isOpen ? (
        <div className="block-template-library-backdrop" onMouseDown={closeFromBackdrop}>
          <aside
            id="block-template-library-dialog"
            className="block-template-library-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-template-library-title"
          >
            <header className="block-template-library-header">
              <div>
                <h2 id="block-template-library-title">{t('templates.title')}</h2>
                <p>{t('templates.description')}</p>
              </div>
              <TooltipLabel content={t('templates.close')} side="left">
                <button
                  ref={closeButtonRef}
                  className="block-template-library-close"
                  type="button"
                  aria-label={t('templates.close')}
                  onClick={closeLibrary}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </TooltipLabel>
            </header>
            <div className="block-template-library-controls">
              <div className="block-template-library-tabs" role="tablist">
                <button
                  type="button"
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
                <Search size={15} aria-hidden="true" />
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
        </div>
      ) : null}
    </>
  )

  function closeLibrary(): void {
    setIsOpen(false)
    setEditingTemplateId(null)
    setDeleteTemplateId(null)
    setSearchQuery('')
    triggerRef.current?.focus()
  }

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

  return (
    <article className="block-template-card">
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
              <button
                type="button"
                aria-label={t('templates.rename', { name: template.name })}
                onClick={onEdit}
              >
                <Pencil size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t(
                  template.scope.type === 'project'
                    ? 'templates.moveToGlobal'
                    : 'templates.moveToProject',
                  { name: template.name }
                )}
                disabled={template.scope.type === 'global' && !currentProjectId}
                onClick={onMove}
              >
                {template.scope.type === 'project' ? (
                  <Globe2 size={14} aria-hidden="true" />
                ) : (
                  <FolderInput size={14} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                aria-label={t('templates.delete', { name: template.name })}
                onClick={onRequestDelete}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
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
                <Play size={14} fill="currentColor" aria-hidden="true" />
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
