import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import {
  defaultTerminalExecutionConfig,
  type TerminalBlockSnapshot,
  type TerminalExecutionConfigSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createExecutionConfigDraft,
  validateExecutionConfigDraft,
  type ExecutionConfigDraft
} from './terminalExecutionConfigDraft'
import type { TerminalBlockMetadataInput } from './types'
import { useI18n } from './i18n/useI18n'
import { TooltipLabel } from './Tooltip'

interface TerminalMetadataFormProps {
  readonly block: TerminalBlockSnapshot
  readonly shouldFocusLaunchCommand: boolean
  readonly onSave: (
    metadata: TerminalBlockMetadataInput,
    executionConfig: TerminalExecutionConfigSnapshot
  ) => Promise<void>
  readonly onCancel: () => void
}

export function TerminalMetadataForm({
  block,
  shouldFocusLaunchCommand,
  onSave,
  onCancel
}: TerminalMetadataFormProps) {
  const { t } = useI18n()
  const [name, setName] = useState(block.name)
  const [description, setDescription] = useState(block.description)
  const [launchCommand, setLaunchCommand] = useState(block.launchCommand)
  const [executionDraft, setExecutionDraft] = useState(() =>
    createExecutionConfigDraft(block.executionConfig ?? defaultTerminalExecutionConfig)
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const launchCommandInputRef = useRef<HTMLInputElement | null>(null)
  const executionValidation = useMemo(
    () => validateExecutionConfigDraft(executionDraft, t),
    [executionDraft, t]
  )
  const canSave = Boolean(name.trim()) && executionValidation.config !== null && !isSaving

  useEffect(() => {
    if (shouldFocusLaunchCommand) launchCommandInputRef.current?.focus()
  }, [shouldFocusLaunchCommand])

  const updateExecutionDraft = (draft: ExecutionConfigDraft): void => {
    setSaveError(null)
    setExecutionDraft(draft)
  }

  const save = async (): Promise<void> => {
    if (!canSave || !executionValidation.config) return

    setIsSaving(true)
    setSaveError(null)
    try {
      await onSave(
        {
          name: name.trim(),
          description: description.trim(),
          launchCommand: launchCommand.trim()
        },
        executionValidation.config
      )
    } catch {
      setSaveError(t('terminalForm.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      className="terminal-metadata-form nodrag"
      aria-label={t('terminalForm.edit')}
      aria-busy={isSaving}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        void save()
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <fieldset className="terminal-metadata-form__fieldset" disabled={isSaving}>
        <div className="terminal-metadata-form__body">
          <div className="terminal-metadata-form__fields">
            <MetadataField label={t('terminalForm.name')}>
              <input
                aria-label={t('terminalForm.terminalName')}
                placeholder={t('terminalForm.namePlaceholder')}
                value={name}
                onChange={(event) => {
                  setSaveError(null)
                  setName(event.currentTarget.value)
                }}
              />
            </MetadataField>
            <MetadataField label={t('terminalForm.description')}>
              <input
                aria-label={t('terminalForm.terminalDescription')}
                placeholder={t('terminalForm.descriptionPlaceholder')}
                value={description}
                onChange={(event) => {
                  setSaveError(null)
                  setDescription(event.currentTarget.value)
                }}
              />
            </MetadataField>
            <MetadataField label={t('terminalForm.launchCommand')}>
              <input
                aria-label={t('terminalForm.launchCommand')}
                ref={launchCommandInputRef}
                placeholder={t('terminalForm.launchPlaceholder')}
                value={launchCommand}
                onChange={(event) => {
                  setSaveError(null)
                  setLaunchCommand(event.currentTarget.value)
                }}
              />
            </MetadataField>
          </div>
          <details className="terminal-execution-config" open={executionDraft.mode === 'service'}>
            <summary>{t('terminalForm.advanced')}</summary>
            <div className="terminal-execution-config__grid">
              <MetadataField label={t('terminalForm.runMode')}>
                <select
                  aria-label={t('terminalForm.runMode')}
                  value={executionDraft.mode}
                  onChange={(event) =>
                    updateExecutionDraft({
                      ...executionDraft,
                      mode: event.currentTarget.value as ExecutionConfigDraft['mode']
                    })
                  }
                >
                  <option value="task">{t('terminalForm.taskMode')}</option>
                  <option value="service">{t('terminalForm.serviceMode')}</option>
                </select>
              </MetadataField>
              {executionDraft.mode === 'task' ? (
                <TaskExecutionFields draft={executionDraft} onChange={updateExecutionDraft} />
              ) : (
                <ServiceExecutionFields draft={executionDraft} onChange={updateExecutionDraft} />
              )}
            </div>
            {executionValidation.error ? (
              <p className="terminal-execution-config__error" role="alert">
                {executionValidation.error}
              </p>
            ) : null}
          </details>
          {saveError ? (
            <p className="terminal-metadata-form__save-error" role="alert">
              {saveError}
            </p>
          ) : null}
        </div>
        <div className="terminal-metadata-form__footer">
          <TooltipLabel content={isSaving ? t('terminalForm.saving') : t('terminalForm.save')}>
            <button
              className="terminal-node__action terminal-node__action--confirm"
              type="submit"
              aria-label={t('terminalForm.save')}
              aria-busy={isSaving}
              disabled={!canSave}
              onClick={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <Check size={15} aria-hidden="true" />
            </button>
          </TooltipLabel>
          <TooltipLabel content={t('terminalForm.cancelShort')}>
            <button
              className="terminal-node__action"
              type="button"
              aria-label={t('terminalForm.cancel')}
              onClick={onCancel}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </TooltipLabel>
        </div>
      </fieldset>
    </form>
  )
}

function TaskExecutionFields({
  draft,
  onChange
}: {
  readonly draft: ExecutionConfigDraft
  readonly onChange: (draft: ExecutionConfigDraft) => void
}) {
  const { t } = useI18n()
  return (
    <>
      <MetadataField label={t('terminalForm.successExitCodes')}>
        <input
          aria-label={t('terminalForm.successExitCodes')}
          placeholder={t('terminalForm.exitCodesPlaceholder')}
          value={draft.successExitCodes}
          onChange={(event) => onChange({ ...draft, successExitCodes: event.currentTarget.value })}
        />
      </MetadataField>
      <MetadataField label={t('terminalForm.taskTimeoutLabel')}>
        <input
          aria-label={t('terminalForm.taskTimeout')}
          inputMode="numeric"
          placeholder={t('terminalForm.noTimeout')}
          value={draft.taskTimeoutSeconds}
          onChange={(event) =>
            onChange({ ...draft, taskTimeoutSeconds: event.currentTarget.value })
          }
        />
      </MetadataField>
    </>
  )
}

function ServiceExecutionFields({
  draft,
  onChange
}: {
  readonly draft: ExecutionConfigDraft
  readonly onChange: (draft: ExecutionConfigDraft) => void
}) {
  const { t } = useI18n()
  return (
    <>
      <MetadataField label={t('terminalForm.readinessMethod')}>
        <select
          aria-label={t('terminalForm.serviceReadinessMethod')}
          value={draft.readinessType}
          onChange={(event) =>
            onChange({
              ...draft,
              readinessType: event.currentTarget.value as ExecutionConfigDraft['readinessType']
            })
          }
        >
          <option value="output">{t('terminalForm.outputReadiness')}</option>
          <option value="tcp">{t('terminalForm.tcpReadiness')}</option>
        </select>
      </MetadataField>
      {draft.readinessType === 'output' ? (
        <MetadataField label={t('terminalForm.readinessTextLabel')}>
          <input
            aria-label={t('terminalForm.readinessText')}
            placeholder={t('terminalForm.readinessTextPlaceholder')}
            value={draft.readinessText}
            onChange={(event) => onChange({ ...draft, readinessText: event.currentTarget.value })}
          />
        </MetadataField>
      ) : null}
      <MetadataField label={t('terminalForm.readinessTimeoutLabel')}>
        <input
          aria-label={t('terminalForm.readinessTimeout')}
          inputMode="numeric"
          value={draft.readinessTimeoutSeconds}
          onChange={(event) =>
            onChange({ ...draft, readinessTimeoutSeconds: event.currentTarget.value })
          }
        />
      </MetadataField>
      <PortIntentFields draft={draft} onChange={onChange} />
    </>
  )
}

function PortIntentFields({
  draft,
  onChange
}: {
  readonly draft: ExecutionConfigDraft
  readonly onChange: (draft: ExecutionConfigDraft) => void
}) {
  const { t } = useI18n()
  const hasPortIntent = draft.portPolicy !== 'unmanaged'

  return (
    <div className="terminal-port-intent-fields">
      <MetadataField label={t('terminalForm.portPolicy')}>
        <select
          aria-label={t('terminalForm.portPolicy')}
          value={draft.portPolicy}
          onChange={(event) => {
            const portPolicy = event.currentTarget.value as ExecutionConfigDraft['portPolicy']
            onChange({
              ...draft,
              portPolicy,
              portBinding:
                portPolicy !== 'fixed' && draft.portBinding === 'none'
                  ? 'environment'
                  : draft.portBinding
            })
          }}
        >
          <option value="unmanaged">{t('terminalForm.portUnmanaged')}</option>
          <option value="fixed">{t('terminalForm.portFixed')}</option>
          <option value="preferred">{t('terminalForm.portPreferred')}</option>
          <option value="auto">{t('terminalForm.portAuto')}</option>
        </select>
      </MetadataField>
      {hasPortIntent ? (
        <>
          <MetadataField label={t('terminalForm.protocol')}>
            <select
              aria-label={t('terminalForm.protocol')}
              value={draft.portProtocol}
              onChange={(event) =>
                onChange({
                  ...draft,
                  portProtocol: event.currentTarget.value as ExecutionConfigDraft['portProtocol']
                })
              }
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="tcp">TCP</option>
            </select>
          </MetadataField>
          {draft.portPolicy === 'fixed' || draft.portPolicy === 'preferred' ? (
            <MetadataField label={t('terminalForm.servicePort')}>
              <input
                aria-label={t('terminalForm.servicePort')}
                inputMode="numeric"
                placeholder={t('terminalForm.portPlaceholder')}
                value={draft.portNumber}
                onChange={(event) => onChange({ ...draft, portNumber: event.currentTarget.value })}
              />
            </MetadataField>
          ) : null}
          <MetadataField label={t('terminalForm.portBinding')}>
            <select
              aria-label={t('terminalForm.portBinding')}
              value={draft.portBinding}
              onChange={(event) =>
                onChange({
                  ...draft,
                  portBinding: event.currentTarget.value as ExecutionConfigDraft['portBinding']
                })
              }
            >
              {draft.portPolicy === 'fixed' ? (
                <option value="none">{t('terminalForm.noBinding')}</option>
              ) : null}
              <option value="environment">{t('terminalForm.environmentBinding')}</option>
              <option value="argument">{t('terminalForm.argumentBinding')}</option>
            </select>
          </MetadataField>
          {draft.portBinding === 'environment' ? (
            <>
              <MetadataField label={t('terminalForm.environmentVariable')}>
                <input
                  aria-label={t('terminalForm.environmentVariable')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={t('terminalForm.environmentPlaceholder')}
                  value={draft.environmentVariable}
                  onChange={(event) =>
                    onChange({ ...draft, environmentVariable: event.currentTarget.value })
                  }
                />
              </MetadataField>
              <p className="terminal-port-intent-fields__hint">
                {t('terminalForm.environmentHint')}
              </p>
            </>
          ) : null}
          {draft.portBinding === 'argument' ? (
            <>
              <MetadataField label={t('terminalForm.argumentSuffix')}>
                <input
                  aria-label={t('terminalForm.argumentSuffix')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={t('terminalForm.argumentPlaceholder')}
                  value={draft.argumentTemplate}
                  onChange={(event) =>
                    onChange({ ...draft, argumentTemplate: event.currentTarget.value })
                  }
                />
              </MetadataField>
              <p className="terminal-port-intent-fields__hint">
                {t('terminalForm.argumentHint', { port: '{port}' })}
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function MetadataField({
  label,
  children
}: {
  readonly label: string
  readonly children: React.ReactNode
}) {
  return (
    <label className="terminal-metadata-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
