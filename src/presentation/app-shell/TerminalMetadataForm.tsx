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
    () => validateExecutionConfigDraft(executionDraft),
    [executionDraft]
  )
  const canSave = Boolean(name.trim()) && executionValidation.config !== null && !isSaving

  useEffect(() => {
    if (shouldFocusLaunchCommand) launchCommandInputRef.current?.focus()
  }, [shouldFocusLaunchCommand])

  const updateExecutionDraft = (draft: ExecutionConfigDraft): void => {
    setSaveError(null)
    setExecutionDraft(draft)
  }

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

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
      setSaveError('保存失败，请重试。')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      className="terminal-metadata-form nodrag"
      aria-label="编辑终端信息"
      aria-busy={isSaving}
      onSubmit={(event) => void save(event)}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <fieldset className="terminal-metadata-form__fieldset" disabled={isSaving}>
        <div className="terminal-metadata-form__body">
          <div className="terminal-metadata-form__fields">
            <MetadataField label="名称">
              <input
                aria-label="终端名称"
                placeholder="例如：Web Server"
                value={name}
                onChange={(event) => {
                  setSaveError(null)
                  setName(event.currentTarget.value)
                }}
              />
            </MetadataField>
            <MetadataField label="描述">
              <input
                aria-label="终端描述"
                placeholder="例如：本地开发服务"
                value={description}
                onChange={(event) => {
                  setSaveError(null)
                  setDescription(event.currentTarget.value)
                }}
              />
            </MetadataField>
            <MetadataField label="启动命令">
              <input
                aria-label="启动命令"
                ref={launchCommandInputRef}
                placeholder="例如：pnpm dev"
                value={launchCommand}
                onChange={(event) => {
                  setSaveError(null)
                  setLaunchCommand(event.currentTarget.value)
                }}
              />
            </MetadataField>
          </div>
          <details className="terminal-execution-config" open={executionDraft.mode === 'service'}>
            <summary>工作流高级配置</summary>
            <div className="terminal-execution-config__grid">
              <MetadataField label="运行模式">
                <select
                  aria-label="运行模式"
                  value={executionDraft.mode}
                  onChange={(event) =>
                    updateExecutionDraft({
                      ...executionDraft,
                      mode: event.currentTarget.value as ExecutionConfigDraft['mode']
                    })
                  }
                >
                  <option value="task">任务（按退出码完成）</option>
                  <option value="service">服务（就绪后放行）</option>
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
          <button
            className="terminal-node__action terminal-node__action--confirm"
            type="submit"
            aria-label="保存终端信息"
            aria-busy={isSaving}
            title="保存终端信息"
            data-cc-tooltip={isSaving ? '正在保存终端信息' : '保存终端信息'}
            disabled={!canSave}
          >
            <Check size={15} aria-hidden="true" />
          </button>
          <button
            className="terminal-node__action"
            type="button"
            aria-label="取消编辑终端信息"
            title="取消编辑终端信息"
            data-cc-tooltip="取消编辑"
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
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
  return (
    <>
      <MetadataField label="成功退出码">
        <input
          aria-label="成功退出码"
          placeholder="0 或 0,2"
          value={draft.successExitCodes}
          onChange={(event) => onChange({ ...draft, successExitCodes: event.currentTarget.value })}
        />
      </MetadataField>
      <MetadataField label="任务超时（秒，可空）">
        <input
          aria-label="任务超时"
          inputMode="numeric"
          placeholder="不限时"
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
  return (
    <>
      <MetadataField label="就绪方式">
        <select
          aria-label="服务就绪方式"
          value={draft.readinessType}
          onChange={(event) =>
            onChange({
              ...draft,
              readinessType: event.currentTarget.value as ExecutionConfigDraft['readinessType']
            })
          }
        >
          <option value="output">输出包含文本</option>
          <option value="tcp">本机 TCP 监听</option>
        </select>
      </MetadataField>
      {draft.readinessType === 'output' ? (
        <MetadataField label="就绪文本（字面匹配）">
          <input
            aria-label="服务就绪文本"
            placeholder="例如：server ready"
            value={draft.readinessText}
            onChange={(event) => onChange({ ...draft, readinessText: event.currentTarget.value })}
          />
        </MetadataField>
      ) : null}
      <MetadataField label="就绪超时（秒）">
        <input
          aria-label="服务就绪超时"
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
  const hasPortIntent = draft.portPolicy !== 'unmanaged'

  return (
    <div className="terminal-port-intent-fields">
      <MetadataField label="端口策略">
        <select
          aria-label="端口策略"
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
          <option value="unmanaged">不管理端口</option>
          <option value="fixed">固定端口</option>
          <option value="preferred">首选端口，可自动回退</option>
          <option value="auto">自动分配端口</option>
        </select>
      </MetadataField>
      {hasPortIntent ? (
        <>
          <MetadataField label="访问协议">
            <select
              aria-label="访问协议"
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
            <MetadataField label="服务端口">
              <input
                aria-label="服务端口"
                inputMode="numeric"
                placeholder="例如：5173"
                value={draft.portNumber}
                onChange={(event) => onChange({ ...draft, portNumber: event.currentTarget.value })}
              />
            </MetadataField>
          ) : null}
          <MetadataField label="端口注入方式">
            <select
              aria-label="端口注入方式"
              value={draft.portBinding}
              onChange={(event) =>
                onChange({
                  ...draft,
                  portBinding: event.currentTarget.value as ExecutionConfigDraft['portBinding']
                })
              }
            >
              {draft.portPolicy === 'fixed' ? <option value="none">不注入</option> : null}
              <option value="environment">环境变量（推荐）</option>
              <option value="argument">命令参数后缀</option>
            </select>
          </MetadataField>
          {draft.portBinding === 'environment' ? (
            <>
              <MetadataField label="环境变量名称">
                <input
                  aria-label="环境变量名称"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="例如：APP_PORT"
                  value={draft.environmentVariable}
                  onChange={(event) =>
                    onChange({ ...draft, environmentVariable: event.currentTarget.value })
                  }
                />
              </MetadataField>
              <p className="terminal-port-intent-fields__hint">
                推荐使用环境变量注入；请填写项目实际读取的变量名。
              </p>
            </>
          ) : null}
          {draft.portBinding === 'argument' ? (
            <>
              <MetadataField label="端口参数后缀">
                <input
                  aria-label="端口参数后缀"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="例如：--port {port}"
                  value={draft.argumentTemplate}
                  onChange={(event) =>
                    onChange({ ...draft, argumentTemplate: event.currentTarget.value })
                  }
                />
              </MetadataField>
              <p className="terminal-port-intent-fields__hint">
                参数会追加到启动命令，仅支持安全参数字符和一个 {'{port}'} 占位符。
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
