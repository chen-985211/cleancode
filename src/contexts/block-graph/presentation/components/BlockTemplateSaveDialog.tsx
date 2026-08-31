import { StarIcon } from '@phosphor-icons/react/dist/csr/Star'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'

import type {
  BlockGraphSnapshot,
  TerminalBlockSnapshot
} from '../../application/dto/BlockGraphSnapshot'
import type { BlockTemplateSnapshot } from '../../application/dto/BlockTemplateSnapshot'
import { createBlockTemplate } from '../../domain/services/BlockTemplateProjection'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { OverlaySurfaceMotion } from '../../../../presentation/shared/components/SurfaceMotion'
import type { SaveBlockTemplateAction } from '../view-models/BlockTemplatePresentationActions'

export function BlockTemplateSaveDialog({
  graph,
  open = true,
  onCancel,
  onExitComplete,
  onSave,
  onSaved,
  projectDirectory,
  selectedBlockIds,
  workspaceId
}: {
  readonly graph: BlockGraphSnapshot
  readonly open?: boolean
  readonly onCancel: () => void
  readonly onExitComplete?: () => void
  readonly onSave: SaveBlockTemplateAction
  readonly onSaved: (template: BlockTemplateSnapshot) => void
  readonly projectDirectory: string
  readonly selectedBlockIds: readonly string[]
  readonly workspaceId: string
}) {
  const { t } = useI18n()
  const selection = useMemo(
    () =>
      createBlockTemplate({
        createdAt: 'preview',
        description: '',
        graph,
        id: 'preview',
        name: 'preview',
        scope: { type: 'project', projectId: graph.projectId },
        selectedBlockIds
      }),
    [graph, selectedBlockIds]
  )
  const selectedBlocks = graph.blocks.filter((block) => selectedBlockIds.includes(block.id))
  const [name, setName] = useState(() => defaultTemplateName(selection.type, selectedBlocks, t))
  const [description, setDescription] = useState('')
  const [scopeKind, setScopeKind] = useState<'project' | 'global'>('project')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const cancelOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancel()
    }
    document.addEventListener('keydown', cancelOnEscape)
    return () => document.removeEventListener('keydown', cancelOnEscape)
  }, [onCancel, open])

  useLayoutEffect(() => {
    if (open) nameInputRef.current?.focus()
  }, [open])

  return (
    <OverlaySurfaceMotion
      className="block-template-save-backdrop overlay-surface-motion overlay-surface-motion--dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-template-save-title"
      open={open}
      onExitComplete={onExitComplete}
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <form
        className="block-template-save-dialog overlay-surface-motion__content"
        onSubmit={(event) => {
          event.preventDefault()
          void submitTemplate()
        }}
      >
        <header>
          <div>
            <span className="block-template-save-type">
              {t(`templates.type.${selection.type}`)}
              {t('templates.templateSuffix')}
            </span>
            <h2 id="block-template-save-title">{t('templates.saveTitle')}</h2>
          </div>
          <button type="button" aria-label={t('common.close')} onClick={onCancel}>
            <XIcon size={17} weight="bold" aria-hidden="true" />
          </button>
        </header>
        <label>
          <span>{t('templates.name')}</span>
          <input
            ref={nameInputRef}
            aria-label={t('templates.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>{t('templates.templateDescription')}</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <fieldset>
          <legend>{t('templates.saveScope')}</legend>
          <label>
            <input
              type="radio"
              name="block-template-scope"
              checked={scopeKind === 'project'}
              onChange={() => setScopeKind('project')}
            />
            <span>{t('templates.scope.project')}</span>
          </label>
          <label>
            <input
              type="radio"
              name="block-template-scope"
              checked={scopeKind === 'global'}
              onChange={() => setScopeKind('global')}
            />
            <span>{t('templates.scope.global')}</span>
          </label>
        </fieldset>
        {errorMessage ? (
          <p className="block-template-save-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <footer>
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={isSaving || !name.trim()}>
            <StarIcon size={14} weight="fill" aria-hidden="true" />
            {isSaving ? t('templates.saving') : t('templates.saveAction')}
          </button>
        </footer>
      </form>
    </OverlaySurfaceMotion>
  )

  async function submitTemplate(): Promise<void> {
    if (isSaving || !name.trim()) return
    setIsSaving(true)
    setErrorMessage(null)
    try {
      const template = await onSave({
        description: description.trim(),
        name: name.trim(),
        projectDirectory,
        scope:
          scopeKind === 'project'
            ? { type: 'project', projectId: graph.projectId }
            : { type: 'global' },
        selectedBlockIds,
        workspaceId
      })
      if (template) onSaved(template)
    } catch {
      setErrorMessage(t('templates.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }
}

function defaultTemplateName(
  type: BlockTemplateSnapshot['type'],
  blocks: readonly TerminalBlockSnapshot[],
  t: ReturnType<typeof useI18n>['t']
): string {
  if (type === 'terminal' && blocks[0]) return blocks[0].name
  return t(`templates.defaultName.${type}`)
}
