import { useState, type FormEvent } from 'react'

import type { WorkspaceAgentSnapshot } from '../../application/dto/WorkspaceAgentSnapshot'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { CanvasMenuItem } from '../../../../presentation/shared/components/CanvasMenuItem'
import { WorkbenchIcon } from '../../../../presentation/shared/components/WorkbenchIcons'

interface AgentCanvasContextActionsProps {
  readonly agent: WorkspaceAgentSnapshot
  readonly mode: 'actions' | 'rename'
  readonly onClose: () => void
  readonly onModeChange: (mode: 'actions' | 'rename') => void
  readonly onRemove: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRename: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
}

export function AgentCanvasContextActions({
  agent,
  mode,
  onClose,
  onModeChange,
  onRemove,
  onRename
}: AgentCanvasContextActionsProps) {
  const { t } = useI18n()
  const [agentName, setAgentName] = useState(agent.name)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const renameAgent = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const normalizedName = agentName.trim()
    if (!normalizedName || isSubmitting) return

    setIsSubmitting(true)
    try {
      await onRename(agent, normalizedName)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const removeAgent = async (): Promise<void> => {
    if (isSubmitting) return

    setIsSubmitting(true)
    onClose()
    try {
      await onRemove(agent)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (mode === 'rename') {
    return (
      <form
        className="canvas-object-context-menu__rename"
        onSubmit={(event) => void renameAgent(event)}
      >
        <input
          autoFocus
          aria-label={t('agent.name')}
          disabled={isSubmitting}
          value={agentName}
          onChange={(event) => setAgentName(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="canvas-object-context-menu__rename-actions">
          <button
            type="submit"
            aria-label={t('agent.saveName')}
            disabled={isSubmitting || !agentName.trim()}
          >
            <WorkbenchIcon role="confirm" size={14} />
          </button>
          <button
            type="button"
            aria-label={t('common.cancel')}
            onClick={() => onModeChange('actions')}
          >
            <WorkbenchIcon role="close" size={14} />
          </button>
        </div>
      </form>
    )
  }

  return (
    <>
      <CanvasMenuItem type="button" role="menuitem" onClick={() => onModeChange('rename')}>
        <WorkbenchIcon role="edit" size={16} />
        {t('agent.rename')}
      </CanvasMenuItem>
      <CanvasMenuItem
        type="button"
        role="menuitem"
        disabled={isSubmitting}
        onClick={() => void removeAgent()}
      >
        <WorkbenchIcon role="delete" size={16} />
        {t('agent.remove')}
      </CanvasMenuItem>
    </>
  )
}
