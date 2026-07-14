import { Bot, Box, Check, Square, Terminal, X } from 'lucide-react'

import type { WorkflowRunStatus } from '../../contexts/run/application/dto/WorkflowRunSnapshot'

interface WorkbenchToolbarProps {
  readonly isDesktopRuntime: boolean
  readonly hasWorkbench: boolean
  readonly isWorkflowActive: boolean
  readonly workflowStatus: WorkflowRunStatus | null
  readonly workflowError: string | null
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedTerminalGroupCandidateCount: number
  readonly canBeginTerminalGroupSelection: boolean
  readonly canCreateTerminalGroup: boolean
  readonly onCreateTerminalBlock: () => void
  readonly onCreateWorkspaceAgent: () => void
  readonly onBeginTerminalGroupSelection: () => void
  readonly onCreateTerminalGroup: () => void
  readonly onCancelTerminalGroupSelection: () => void
  readonly onStopWorkflow: () => void
}

export function WorkbenchToolbar(props: WorkbenchToolbarProps) {
  return (
    <div className="app-shell__toolbar" aria-label="工作台工具栏">
      <button
        className="toolbar-button toolbar-button--primary"
        type="button"
        onClick={props.onCreateTerminalBlock}
        disabled={!props.isDesktopRuntime || !props.hasWorkbench}
      >
        <Terminal size={16} aria-hidden="true" />
        新建终端积木
      </button>
      <button
        className="toolbar-button"
        type="button"
        onClick={props.onCreateWorkspaceAgent}
        disabled={!props.isDesktopRuntime || !props.hasWorkbench}
      >
        <Bot size={16} aria-hidden="true" />
        新建 Agent
      </button>
      <span className="toolbar-divider" aria-hidden="true" />
      {props.workflowStatus ? (
        <span
          className={`toolbar-workflow-status toolbar-workflow-status--${props.workflowStatus}`}
        >
          {workflowStatusLabel[props.workflowStatus]}
        </span>
      ) : null}
      {props.isWorkflowActive ? (
        <button
          className="toolbar-button"
          type="button"
          onClick={props.onStopWorkflow}
          title="按逆依赖顺序停止运行中的终端"
        >
          <Square size={14} aria-hidden="true" />
          停止流程
        </button>
      ) : null}
      {props.workflowError ? (
        <span className="toolbar-workflow-error" role="alert" title={props.workflowError}>
          {props.workflowError}
        </span>
      ) : null}
      {props.isTerminalGroupSelectionMode ? (
        <>
          <span className="toolbar-selection-status" role="status">
            组合编辑
            <strong>{props.selectedTerminalGroupCandidateCount}</strong>
          </span>
          <button
            className="toolbar-button toolbar-button--primary"
            type="button"
            onClick={props.onCreateTerminalGroup}
            disabled={!props.canCreateTerminalGroup}
          >
            <Check size={16} aria-hidden="true" />
            创建组合
          </button>
          <button
            className="toolbar-button"
            type="button"
            onClick={props.onCancelTerminalGroupSelection}
          >
            <X size={16} aria-hidden="true" />
            完成
          </button>
        </>
      ) : (
        <button
          className="toolbar-button"
          type="button"
          onClick={props.onBeginTerminalGroupSelection}
          disabled={
            !props.isDesktopRuntime || !props.hasWorkbench || !props.canBeginTerminalGroupSelection
          }
        >
          <Box size={16} aria-hidden="true" />
          组合终端
        </button>
      )}
    </div>
  )
}

const workflowStatusLabel: Record<WorkflowRunStatus, string> = {
  running: '流程运行中',
  ready: '服务已就绪',
  succeeded: '流程成功',
  failed: '流程失败',
  stopped: '流程已停止'
}
