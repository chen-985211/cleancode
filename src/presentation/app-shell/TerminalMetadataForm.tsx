import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import {
  defaultTerminalExecutionConfig,
  type TerminalBlockSnapshot,
  type TerminalExecutionConfigSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalBlockMetadataInput } from './types'
import {
  createExecutionConfigDraft,
  parseExecutionConfigDraft,
  type ExecutionConfigDraft
} from './terminalExecutionConfigDraft'

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
  const launchCommandInputRef = useRef<HTMLInputElement | null>(null)
  const executionConfig = useMemo(() => parseExecutionConfigDraft(executionDraft), [executionDraft])
  const canSave = Boolean(name.trim()) && executionConfig !== null

  useEffect(() => {
    if (shouldFocusLaunchCommand) launchCommandInputRef.current?.focus()
  }, [shouldFocusLaunchCommand])

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    if (!canSave || !executionConfig) return

    await onSave(
      {
        name: name.trim(),
        description: description.trim(),
        launchCommand: launchCommand.trim()
      },
      executionConfig
    )
  }

  return (
    <form
      className="terminal-metadata-form nodrag"
      aria-label="编辑终端信息"
      onSubmit={(event) => void save(event)}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="terminal-metadata-form__fields">
        <MetadataField label="名称">
          <input
            aria-label="终端名称"
            placeholder="例如：Web Server"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </MetadataField>
        <MetadataField label="描述">
          <input
            aria-label="终端描述"
            placeholder="例如：本地开发服务"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </MetadataField>
        <MetadataField label="启动命令">
          <input
            aria-label="启动命令"
            ref={launchCommandInputRef}
            placeholder="例如：pnpm dev"
            value={launchCommand}
            onChange={(event) => setLaunchCommand(event.currentTarget.value)}
          />
        </MetadataField>
      </div>
      <details className="terminal-execution-config">
        <summary>工作流高级配置</summary>
        <div className="terminal-execution-config__grid">
          <MetadataField label="运行模式">
            <select
              aria-label="运行模式"
              value={executionDraft.mode}
              onChange={(event) =>
                setExecutionDraft({
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
            <TaskExecutionFields draft={executionDraft} onChange={setExecutionDraft} />
          ) : (
            <ServiceExecutionFields draft={executionDraft} onChange={setExecutionDraft} />
          )}
        </div>
        {!executionConfig ? (
          <p className="terminal-execution-config__error" role="alert">
            请检查退出码、超时或服务就绪参数。
          </p>
        ) : null}
      </details>
      <div className="terminal-metadata-form__footer">
        <button
          className="terminal-node__action terminal-node__action--confirm"
          type="submit"
          aria-label="保存终端信息"
          title="保存终端信息"
          data-cc-tooltip="保存终端信息"
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
          <option value="tcp">本机 TCP 端口</option>
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
      ) : (
        <MetadataField label="本机端口">
          <input
            aria-label="服务就绪端口"
            inputMode="numeric"
            placeholder="例如：3000"
            value={draft.readinessPort}
            onChange={(event) => onChange({ ...draft, readinessPort: event.currentTarget.value })}
          />
        </MetadataField>
      )}
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
    </>
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
