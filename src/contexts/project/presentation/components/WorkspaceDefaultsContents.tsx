import { useState, type ReactNode, type MouseEvent } from 'react'
import { FolderIcon } from '@phosphor-icons/react/dist/csr/Folder'
import { GlobeIcon } from '@phosphor-icons/react/dist/csr/Globe'
import { TerminalWindowIcon } from '@phosphor-icons/react/dist/csr/TerminalWindow'
import { RobotIcon } from '@phosphor-icons/react/dist/csr/Robot'
import { MinusIcon } from '@phosphor-icons/react/dist/csr/Minus'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import {
  MAX_WORKSPACE_DEFAULT_AGENTS,
  type WorkspaceDefaults
} from '../../application/dto/WorkspaceInitializationDetails'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { ApplicationSettingsSwitch } from '../../../../presentation/shared/components/ApplicationSettingsSwitch'
import { WorkspaceDefaultsPicker } from './WorkspaceDefaultsPicker'
import { WorkspaceDefaultsButton, WorkspaceDefaultsRows } from './WorkspaceDefaultsMotion'

export interface WorkspaceDefaultsCatalog {
  readonly templates: readonly {
    readonly id: string
    readonly name: string
    readonly source: 'project' | 'global'
  }[]
  readonly providers: readonly {
    readonly id: string
    readonly name: string
    readonly icon: ReactNode
  }[]
}
export function WorkspaceDefaultsContents({
  value,
  templates,
  providers,
  onChange
}: WorkspaceDefaultsCatalog & {
  readonly value: WorkspaceDefaults
  readonly onChange: (value: WorkspaceDefaults) => void
}) {
  const { t } = useI18n()
  const total = value.agents.reduce((sum, agent) => sum + agent.count, 0)
  return (
    <div className="workspace-defaults-sections">
      <section aria-label={t('workspaceDefaults.agent')}>
        <header>
          <div>
            <h3>{t('workspaceDefaults.agent')}</h3>
            <p>{t('workspaceDefaults.agentHint')}</p>
          </div>
          <WorkspaceDefaultsPicker
            label={t('workspaceDefaults.addAgent')}
            groups={[
              {
                name: t('workspaceDefaults.agent'),
                empty: t('workspaceDefaults.noProviders'),
                choices: providers.map((provider) => ({
                  ...provider,
                  selected:
                    total >= MAX_WORKSPACE_DEFAULT_AGENTS ||
                    value.agents.some((agent) => agent.providerId === provider.id)
                }))
              }
            ]}
            onAdd={(providerId) =>
              onChange({ ...value, agents: [...value.agents, { providerId, count: 1 }] })
            }
          />
        </header>
        <WorkspaceDefaultsRows
          rows={
            value.agents.length
              ? value.agents.map((agent) => {
                  const provider = providers.find((item) => item.id === agent.providerId)
                  const name =
                    provider?.name ?? t('workspaceDefaults.unavailable', { name: agent.providerId })
                  return {
                    id: agent.providerId,
                    content: (
                      <div className="workspace-defaults-row">
                        <span className="workspace-defaults-glyph">
                          {provider?.icon ?? <RobotIcon size={20} aria-hidden="true" />}
                        </span>
                        <span className="workspace-defaults-name">{name}</span>
                        <Quantity
                          name={name}
                          count={agent.count}
                          maximum={MAX_WORKSPACE_DEFAULT_AGENTS - total + agent.count}
                          onChange={(count) =>
                            onChange({
                              ...value,
                              agents: value.agents.map((item) =>
                                item.providerId === agent.providerId ? { ...item, count } : item
                              )
                            })
                          }
                        />
                        <WorkspaceDefaultsButton
                          className="workspace-defaults-remove"
                          aria-label={t('workspaceDefaults.remove', { name })}
                          onClick={(event) => {
                            focusAdd(event)
                            onChange({
                              ...value,
                              agents: value.agents.filter(
                                (item) => item.providerId !== agent.providerId
                              )
                            })
                          }}
                        >
                          <XIcon size={15} aria-hidden="true" />
                        </WorkspaceDefaultsButton>
                      </div>
                    )
                  }
                })
              : [
                  {
                    id: 'empty',
                    content: (
                      <p className="workspace-defaults-empty">
                        {t('workspaceDefaults.emptyAgents')}
                      </p>
                    )
                  }
                ]
          }
        />
        {total >= MAX_WORKSPACE_DEFAULT_AGENTS ? (
          <p className="workspace-defaults-description">
            {t('workspaceDefaults.agentLimit', { count: MAX_WORKSPACE_DEFAULT_AGENTS })}
          </p>
        ) : null}
      </section>
      <section aria-label={t('workspaceDefaults.templates')}>
        <header>
          <div>
            <h3>{t('workspaceDefaults.templates')}</h3>
            <p>{t('workspaceDefaults.templateHint')}</p>
          </div>
          <WorkspaceDefaultsPicker
            label={t('workspaceDefaults.addTemplate')}
            groups={(['project', 'global'] as const).map((source) => ({
              name: t(
                source === 'project'
                  ? 'workspaceDefaults.projectSource'
                  : 'workspaceDefaults.globalSource'
              ),
              empty: t('workspaceDefaults.emptySource'),
              choices: templates
                .filter((item) => item.source === source)
                .map((template) => ({
                  ...template,
                  icon: <TerminalWindowIcon size={18} aria-hidden="true" />,
                  selected: value.templates.some((item) => item.templateId === template.id)
                }))
            }))}
            onAdd={(templateId) =>
              onChange({
                ...value,
                templates: [...value.templates, { templateId, runAfterPlacement: false }]
              })
            }
          />
        </header>
        <WorkspaceDefaultsRows
          rows={
            value.templates.length
              ? value.templates.map((selected) => {
                  const template = templates.find((item) => item.id === selected.templateId)
                  const name =
                    template?.name ??
                    t('workspaceDefaults.unavailable', { name: selected.templateId })
                  const source = template?.source
                  return {
                    id: selected.templateId,
                    content: (
                      <div className="workspace-defaults-row">
                        <span className="workspace-defaults-glyph">
                          <TerminalWindowIcon size={20} aria-hidden="true" />
                        </span>
                        <div className="workspace-defaults-name">
                          <span>{name}</span>
                          {source ? (
                            <small>
                              {source === 'project' ? (
                                <FolderIcon size={12} aria-hidden="true" />
                              ) : (
                                <GlobeIcon size={12} aria-hidden="true" />
                              )}
                              {t(
                                source === 'project'
                                  ? 'workspaceDefaults.projectSource'
                                  : 'workspaceDefaults.globalSource'
                              )}
                            </small>
                          ) : null}
                        </div>
                        <label className="workspace-defaults-run">
                          <span>{t('workspaceDefaults.runHint')}</span>
                          <ApplicationSettingsSwitch
                            checked={selected.runAfterPlacement}
                            label={t('workspaceDefaults.run', { name })}
                            onClick={() =>
                              onChange({
                                ...value,
                                templates: value.templates.map((item) =>
                                  item.templateId === selected.templateId
                                    ? { ...item, runAfterPlacement: !item.runAfterPlacement }
                                    : item
                                )
                              })
                            }
                          />
                        </label>
                        <WorkspaceDefaultsButton
                          className="workspace-defaults-remove"
                          aria-label={t('workspaceDefaults.remove', { name })}
                          onClick={(event) => {
                            focusAdd(event)
                            onChange({
                              ...value,
                              templates: value.templates.filter(
                                (item) => item.templateId !== selected.templateId
                              )
                            })
                          }}
                        >
                          <XIcon size={15} aria-hidden="true" />
                        </WorkspaceDefaultsButton>
                      </div>
                    )
                  }
                })
              : [
                  {
                    id: 'empty',
                    content: (
                      <p className="workspace-defaults-empty">
                        {t('workspaceDefaults.emptyTemplates')}
                      </p>
                    )
                  }
                ]
          }
        />
      </section>
    </div>
  )
}

function Quantity({
  name,
  count,
  maximum,
  onChange
}: {
  readonly name: string
  readonly count: number
  readonly maximum: number
  readonly onChange: (count: number) => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState(String(count))
  const [previous, setPrevious] = useState(count)
  if (previous !== count) {
    setPrevious(count)
    setText(String(count))
  }
  return (
    <div className="workspace-defaults-quantity">
      <WorkspaceDefaultsButton
        disabled={count <= 1}
        aria-label={t('workspaceDefaults.decrease', { name })}
        onClick={() => onChange(count - 1)}
      >
        <MinusIcon size={12} aria-hidden="true" />
      </WorkspaceDefaultsButton>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={maximum}
        step={1}
        aria-label={t('workspaceDefaults.quantity', { name })}
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          const parsed = Number(next)
          if (Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum) onChange(parsed)
        }}
        onBlur={() => setText(String(count))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            setText(String(count))
          }
        }}
      />
      <WorkspaceDefaultsButton
        disabled={count >= maximum}
        aria-label={t('workspaceDefaults.increase', { name })}
        onClick={() => onChange(count + 1)}
      >
        <PlusIcon size={12} aria-hidden="true" />
      </WorkspaceDefaultsButton>
    </div>
  )
}

function focusAdd(event: MouseEvent<HTMLButtonElement>) {
  event.currentTarget
    .closest('section')
    ?.querySelector<HTMLButtonElement>('.workspace-defaults-add')
    ?.focus({ preventScroll: true })
}
