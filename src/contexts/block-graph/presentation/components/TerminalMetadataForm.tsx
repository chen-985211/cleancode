import { AnchoredSurfaceMotion } from '../../../../presentation/shared/components/SurfaceMotion'
import { TerminalMetadataFieldsMotion } from './TerminalMetadataFieldsMotion'
import { ChoiceSelect } from '../../../../presentation/shared/components/ChoiceSelect'
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { TerminalWindowIcon } from '@phosphor-icons/react/dist/csr/TerminalWindow'
import type { Icon, IconWeight } from '@phosphor-icons/react'
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from 'react'

import {
  defaultTerminalExecutionConfig,
  type TerminalBlockSnapshot,
  type TerminalExecutionConfigSnapshot
} from '../../application/dto/BlockGraphSnapshot'
import {
  createExecutionConfigDraft,
  validateExecutionConfigDraft,
  type ExecutionConfigDraft
} from '../view-models/terminalExecutionConfigDraft'
import type { TerminalBlockMetadataInput } from '../view-models/TerminalDefinitionPresentationTypes'
import { useSelectionIndicatorMotion } from '../../../../presentation/shared/hooks/useSelectionMotion'
import { useI18n } from '../../../../presentation/i18n/useI18n'

interface TerminalMetadataFormProps {
  readonly open?: boolean
  readonly block: TerminalBlockSnapshot
  readonly formId?: string
  readonly shouldFocusLaunchCommand: boolean
  readonly onSave: (
    metadata: TerminalBlockMetadataInput,
    executionConfig: TerminalExecutionConfigSnapshot
  ) => Promise<void>
  readonly onCancel: () => void
}

export function TerminalMetadataForm({ open = true, ...props }: TerminalMetadataFormProps) {
  const [draftSession, setDraftSession] = useState({ open, revision: 0 })
  if (draftSession.open !== open) {
    // Keep the exiting draft visible, but start fresh even if exit motion is interrupted.
    setDraftSession({ open, revision: draftSession.revision + (open ? 1 : 0) })
  }

  return (
    <AnchoredSurfaceMotion
      open={open}
      springPreset="anchored"
      className="terminal-metadata-surface anchored-surface-motion nodrag nopan nowheel"
    >
      <TerminalMetadataFormContent key={draftSession.revision} {...props} open={open} />
    </AnchoredSurfaceMotion>
  )
}

function TerminalMetadataFormContent({
  open,
  block,
  formId,
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
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const launchCommandInputRef = useRef<HTMLTextAreaElement | null>(null)
  const executionValidation = useMemo(
    () => validateExecutionConfigDraft(executionDraft, t),
    [executionDraft, t]
  )
  const canSave = open && Boolean(name.trim()) && executionValidation.config !== null && !isSaving

  useLayoutEffect(() => {
    if (!open) return
    const target = shouldFocusLaunchCommand ? launchCommandInputRef.current : nameInputRef.current
    target?.focus()
  }, [open, shouldFocusLaunchCommand])

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
      id={formId}
      className="terminal-metadata-form nodrag nopan nowheel"
      aria-label={t('terminalForm.edit')}
      aria-busy={isSaving}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        void save()
      }}
      onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest('button[type="submit"]')) {
          event.preventDefault()
          void save()
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || isSaving) return
        event.preventDefault()
        event.stopPropagation()
        onCancel()
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <fieldset className="terminal-metadata-form__fieldset" disabled={isSaving || !open}>
        <header className="terminal-metadata-form__header">
          <span className="terminal-metadata-form__header-icon" aria-hidden="true">
            <TerminalMetadataIcon
              IconComponent={TerminalWindowIcon}
              glyph="terminal-window"
              role="terminal"
              size={16}
              weight="regular"
            />
          </span>
          <span className="terminal-metadata-form__heading">
            <strong>{t('terminalForm.editTitle')}</strong>
          </span>
        </header>
        <div className="terminal-metadata-form__body">
          <div className="terminal-metadata-form__fields">
            <MetadataField label={t('terminalForm.name')}>
              <input
                aria-label={t('terminalForm.terminalName')}
                ref={nameInputRef}
                placeholder={t('terminalForm.namePlaceholder')}
                value={name}
                onChange={(event) => {
                  setSaveError(null)
                  setName(event.currentTarget.value)
                }}
              />
            </MetadataField>
            <MetadataField label={t('terminalForm.description')} optional>
              <textarea
                rows={2}
                wrap="soft"
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
              <textarea
                className="terminal-metadata-form__command"
                rows={2}
                wrap="soft"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
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
          <section
            className="terminal-execution-config"
            aria-label={t('terminalForm.workflowMode')}
          >
            <ExecutionModeSelection draft={executionDraft} onChange={updateExecutionDraft} />
            <TerminalMetadataFieldsMotion open={executionDraft.mode === 'task'}>
              <div className="terminal-execution-config__grid">
                <TaskExecutionFields draft={executionDraft} onChange={updateExecutionDraft} />
              </div>
              {executionValidation.error ? (
                <p className="terminal-execution-config__error" role="alert">
                  {executionValidation.error}
                </p>
              ) : null}
            </TerminalMetadataFieldsMotion>
            <TerminalMetadataFieldsMotion open={executionDraft.mode === 'service'}>
              <ServiceExecutionFields
                draft={executionDraft}
                onChange={updateExecutionDraft}
                readinessError={
                  executionValidation.errorSection === 'readiness'
                    ? executionValidation.error
                    : null
                }
                portError={
                  executionValidation.errorSection === 'port' ? executionValidation.error : null
                }
              />
            </TerminalMetadataFieldsMotion>
          </section>
          {saveError ? (
            <p className="terminal-metadata-form__save-error" role="alert">
              {saveError}
            </p>
          ) : null}
        </div>
        <div className="terminal-metadata-form__footer">
          <button
            className="terminal-metadata-form__action"
            type="button"
            aria-label={t('terminalForm.cancel')}
            onClick={onCancel}
          >
            <span>{t('terminalForm.cancelShort')}</span>
          </button>
          <button
            className="terminal-metadata-form__action terminal-metadata-form__action--primary"
            type="submit"
            aria-label={t('terminalForm.save')}
            aria-busy={isSaving}
            disabled={!canSave}
          >
            {isSaving ? (
              <TerminalMetadataIcon
                IconComponent={CircleNotchIcon}
                className="terminal-metadata-form__saving-indicator"
                glyph="circle-notch"
                role="loading"
                size={14}
                weight="bold"
              />
            ) : null}
            <span>{isSaving ? t('terminalForm.savingShort') : t('terminalForm.saveShort')}</span>
          </button>
        </div>
      </fieldset>
    </form>
  )
}

function ExecutionModeSelection({
  draft,
  onChange
}: {
  readonly draft: ExecutionConfigDraft
  readonly onChange: (draft: ExecutionConfigDraft) => void
}) {
  const { t } = useI18n()
  const id = useId()
  const [containerRef, indicatorRef] = useSelectionIndicatorMotion(draft.mode)
  return (
    <div className="terminal-execution-config__mode-row">
      <span id={id}>{t('terminalForm.workflowMode')}</span>
      <div
        ref={containerRef}
        className="terminal-execution-mode"
        role="radiogroup"
        aria-label={t('terminalForm.runMode')}
      >
        <span
          ref={indicatorRef}
          className="selection-motion-indicator terminal-execution-mode__indicator"
          aria-hidden="true"
        />
        {(['task', 'service'] as const).map((mode) => (
          <label key={mode} data-selection-motion-option={mode}>
            <input
              type="radio"
              name={id}
              checked={draft.mode === mode}
              onChange={() => onChange({ ...draft, mode })}
            />
            <span>{t(mode === 'task' ? 'terminalForm.taskMode' : 'terminalForm.serviceMode')}</span>
          </label>
        ))}
      </div>
    </div>
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
      <MetadataField label={t('terminalForm.taskTimeout')}>
        <span className="terminal-metadata-field__unit">
          <input
            aria-label={t('terminalForm.taskTimeout')}
            inputMode="numeric"
            placeholder={t('terminalForm.noTimeout')}
            value={draft.taskTimeoutSeconds}
            onChange={(event) =>
              onChange({ ...draft, taskTimeoutSeconds: event.currentTarget.value })
            }
          />
          <span>{t('terminalForm.seconds')}</span>
        </span>
      </MetadataField>
    </>
  )
}

function ServiceExecutionFields({
  draft,
  onChange,
  readinessError,
  portError
}: {
  readonly readinessError: string | null
  readonly portError: string | null
  readonly draft: ExecutionConfigDraft
  readonly onChange: (draft: ExecutionConfigDraft) => void
}) {
  const { t } = useI18n()
  return (
    <div className="terminal-execution-config__service">
      <div className="terminal-execution-config__grid">
        <MetadataField label={t('terminalForm.readinessMethod')}>
          <ChoiceSelect
            label={t('terminalForm.serviceReadinessMethod')}
            value={draft.readinessType}
            onChange={(value) =>
              onChange({
                ...draft,
                readinessType: value as ExecutionConfigDraft['readinessType']
              })
            }
            options={[
              { value: 'output', label: t('terminalForm.outputReadiness') },
              { value: 'tcp', label: t('terminalForm.tcpReadiness') }
            ]}
          />
        </MetadataField>
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
      </div>
      <TerminalMetadataFieldsMotion open={draft.readinessType === 'output'}>
        <MetadataField label={t('terminalForm.readinessTextLabel')}>
          <input
            aria-label={t('terminalForm.readinessText')}
            placeholder={t('terminalForm.readinessTextPlaceholder')}
            value={draft.readinessText}
            onChange={(event) => onChange({ ...draft, readinessText: event.currentTarget.value })}
          />
        </MetadataField>
      </TerminalMetadataFieldsMotion>
      {readinessError ? (
        <p className="terminal-execution-config__error" role="alert">
          {readinessError}
        </p>
      ) : null}
      <PortIntentFields draft={draft} onChange={onChange} />
      {portError ? (
        <p className="terminal-execution-config__error" role="alert">
          {portError}
        </p>
      ) : null}
    </div>
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
        <ChoiceSelect
          label={t('terminalForm.portPolicy')}
          value={draft.portPolicy}
          onChange={(value) => {
            const portPolicy = value as ExecutionConfigDraft['portPolicy']
            onChange({
              ...draft,
              portPolicy,
              portBinding:
                portPolicy !== 'fixed' && draft.portBinding === 'none'
                  ? 'environment'
                  : draft.portBinding
            })
          }}
          options={[
            { value: 'unmanaged', label: t('terminalForm.portUnmanaged') },
            { value: 'fixed', label: t('terminalForm.portFixed') },
            { value: 'preferred', label: t('terminalForm.portPreferred') },
            { value: 'auto', label: t('terminalForm.portAuto') }
          ]}
        />
      </MetadataField>
      <TerminalMetadataFieldsMotion
        open={hasPortIntent}
        className="terminal-metadata-fields-motion--cell"
      >
        <MetadataField label={t('terminalForm.protocol')}>
          <ChoiceSelect
            label={t('terminalForm.protocol')}
            value={draft.portProtocol}
            onChange={(value) =>
              onChange({
                ...draft,
                portProtocol: value as ExecutionConfigDraft['portProtocol']
              })
            }
            options={[
              { value: 'http', label: 'HTTP' },
              { value: 'https', label: 'HTTPS' },
              { value: 'tcp', label: 'TCP' }
            ]}
          />
        </MetadataField>
      </TerminalMetadataFieldsMotion>
      <TerminalMetadataFieldsMotion
        open={hasPortIntent}
        className="terminal-execution-config__wide-field"
        contentClassName="terminal-execution-config__grid terminal-port-intent-fields__managed"
      >
        <MetadataField label={t('terminalForm.portBinding')}>
          <ChoiceSelect
            label={t('terminalForm.portBinding')}
            value={draft.portBinding}
            onChange={(value) =>
              onChange({
                ...draft,
                portBinding: value as ExecutionConfigDraft['portBinding']
              })
            }
            options={[
              ...(draft.portPolicy === 'fixed'
                ? [{ value: 'none', label: t('terminalForm.noBinding') }]
                : []),
              { value: 'environment', label: t('terminalForm.environmentBinding') },
              { value: 'argument', label: t('terminalForm.argumentBinding') }
            ]}
          />
        </MetadataField>
        <TerminalMetadataFieldsMotion
          open={draft.portPolicy === 'fixed' || draft.portPolicy === 'preferred'}
          className="terminal-metadata-fields-motion--cell"
        >
          <MetadataField label={t('terminalForm.servicePort')}>
            <input
              aria-label={t('terminalForm.servicePort')}
              inputMode="numeric"
              placeholder={t('terminalForm.portPlaceholder')}
              value={draft.portNumber}
              onChange={(event) => onChange({ ...draft, portNumber: event.currentTarget.value })}
            />
          </MetadataField>
        </TerminalMetadataFieldsMotion>
        <TerminalMetadataFieldsMotion
          open={draft.portBinding === 'environment'}
          className="terminal-execution-config__wide-field"
          contentClassName="terminal-execution-config__grid"
        >
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
          <p className="terminal-port-intent-fields__hint">{t('terminalForm.environmentHint')}</p>
        </TerminalMetadataFieldsMotion>
        <TerminalMetadataFieldsMotion
          open={draft.portBinding === 'argument'}
          className="terminal-execution-config__wide-field"
          contentClassName="terminal-execution-config__grid"
        >
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
        </TerminalMetadataFieldsMotion>
      </TerminalMetadataFieldsMotion>
    </div>
  )
}

function MetadataField({
  label,
  children,
  optional = false
}: {
  readonly optional?: boolean
  readonly label: string
  readonly children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <label className="terminal-metadata-field">
      <span className="terminal-metadata-field__label">
        {label}
        {optional ? (
          <span className="terminal-metadata-field__optional">{t('terminalForm.optional')}</span>
        ) : null}
      </span>
      {children}
    </label>
  )
}

interface TerminalMetadataIconProps {
  readonly IconComponent: Icon
  readonly className?: string
  readonly glyph: string
  readonly role: string
  readonly size: number
  readonly weight: IconWeight
}

function TerminalMetadataIcon({
  IconComponent,
  className,
  glyph,
  role,
  size,
  weight
}: TerminalMetadataIconProps) {
  return (
    <IconComponent
      aria-hidden="true"
      className={className}
      data-icon-glyph={glyph}
      data-icon-role={role}
      data-icon-weight={weight}
      focusable="false"
      size={size}
      weight={weight}
    />
  )
}
