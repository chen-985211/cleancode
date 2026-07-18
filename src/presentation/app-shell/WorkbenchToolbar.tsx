import { Bot, Box, Check, Terminal, X } from 'lucide-react'

interface WorkbenchToolbarProps {
  readonly isDesktopRuntime: boolean
  readonly hasWorkbench: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedTerminalGroupCandidateCount: number
  readonly canBeginTerminalGroupSelection: boolean
  readonly canCreateTerminalGroup: boolean
  readonly onCreateTerminalBlock: () => void
  readonly onCreateWorkspaceAgent: () => void
  readonly onBeginTerminalGroupSelection: () => void
  readonly onCreateTerminalGroup: () => void
  readonly onCancelTerminalGroupSelection: () => void
}

export function WorkbenchToolbar(props: WorkbenchToolbarProps) {
  return (
    <div className="app-shell__toolbar" role="toolbar" aria-label="工作台工具栏">
      <div className="app-shell__toolbar-group" role="group" aria-label="终端工具">
        <button
          className="toolbar-button toolbar-button--primary"
          type="button"
          onClick={props.onCreateTerminalBlock}
          disabled={!props.isDesktopRuntime || !props.hasWorkbench}
        >
          <Terminal size={16} aria-hidden="true" />
          新建终端积木
        </button>
        <span className="toolbar-divider" aria-hidden="true" />
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
              !props.isDesktopRuntime ||
              !props.hasWorkbench ||
              !props.canBeginTerminalGroupSelection
            }
          >
            <Box size={16} aria-hidden="true" />
            组合终端
          </button>
        )}
      </div>
      <div
        className="app-shell__toolbar-group app-shell__toolbar-group--agent"
        role="group"
        aria-label="Agent 工具"
      >
        <button
          className="toolbar-button"
          type="button"
          onClick={props.onCreateWorkspaceAgent}
          disabled={!props.isDesktopRuntime || !props.hasWorkbench}
        >
          <Bot size={16} aria-hidden="true" />
          新建 Agent
        </button>
      </div>
    </div>
  )
}
