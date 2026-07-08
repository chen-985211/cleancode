import { fireEvent, render, screen } from '@testing-library/react'

import { defaultTerminalBlockSize } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { TerminalGroupNode } from '../../../src/presentation/app-shell/TerminalGroupNode'
import {
  createIdleTerminalState,
  type TerminalGroupFlowNode
} from '../../../src/presentation/app-shell/types'

describe('terminal group member labels', () => {
  it('hides member labels while the group is expanded', () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: false })} />)

    expect(screen.queryByRole('button', { name: 'Backend 移出组合' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Frontend 移出组合' })).not.toBeInTheDocument()
  })

  it('removes selected member terminals from the group through the minus action', () => {
    const onRemoveSelectedTerminalsFromGroup = vi.fn(async () => undefined)

    render(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({
          isCollapsed: false,
          onRemoveSelectedTerminalsFromGroup,
          selectedMemberBlockIds: ['backend-terminal']
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '启动项目 移出选中终端' }))

    expect(onRemoveSelectedTerminalsFromGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'development-group' })
    )
  })

  it('disables the minus action until a member terminal is selected', () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: false })} />)

    expect(screen.getByRole('button', { name: '启动项目 移出选中终端' })).toBeDisabled()
  })

  it('keeps terminal session restart behind the group more action', () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: false })} />)

    expect(
      screen.queryByRole('button', { name: '启动项目 重开组合终端会话' })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '启动项目 更多组合操作' }))

    expect(screen.getByRole('button', { name: '启动项目 重开组合终端会话' })).toBeInTheDocument()
  })

  it('keeps the group header compact while editing the group name', () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: true })} />)

    fireEvent.click(screen.getByRole('button', { name: '启动项目 编辑组合名称' }))

    expect(screen.getByRole('textbox', { name: '组合名称' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存组合名称' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消编辑组合名称' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '启动项目 启动组合命令' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '启动项目 停止全部当前命令' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '启动项目 更多组合操作' })).not.toBeInTheDocument()
  })

  it('keeps member labels available while the group is collapsed', () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: true })} />)

    expect(screen.getByRole('button', { name: 'Backend 移出组合' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Frontend 移出组合' })).toBeInTheDocument()
  })

  it('shows drop feedback while editing group membership', () => {
    render(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({ isCollapsed: false, dropFeedback: 'dissolve' })}
      />
    )

    expect(screen.getByText('松开后解散组合')).toBeInTheDocument()
  })
})

function createTerminalGroupNodeProps(input: {
  readonly isCollapsed: boolean
  readonly dropFeedback?: TerminalGroupFlowNode['data']['dropFeedback']
  readonly onRemoveSelectedTerminalsFromGroup?: TerminalGroupFlowNode['data']['onRemoveSelectedTerminalsFromGroup']
  readonly selectedMemberBlockIds?: readonly string[]
}): Parameters<typeof TerminalGroupNode>[0] {
  return {
    id: 'development-group',
    type: 'terminalGroup',
    data: {
      group: {
        id: 'development-group',
        type: 'terminal-group',
        name: '启动项目',
        position: { x: 288, y: 164 },
        size: { width: 984, height: input.isCollapsed ? 150 : 458 },
        isCollapsed: input.isCollapsed,
        memberBlockIds: ['backend-terminal', 'frontend-terminal']
      },
      memberBlocks: [
        createTerminalBlock('backend-terminal', 'Backend', 320),
        createTerminalBlock('frontend-terminal', 'Frontend', 820)
      ],
      memberStates: {
        'backend-terminal': createIdleTerminalState(),
        'frontend-terminal': createIdleTerminalState()
      },
      selectedUngroupedTerminalBlockIds: [],
      selectedMemberBlockIds: input.selectedMemberBlockIds ?? [],
      isSelected: false,
      dropFeedback: input.dropFeedback ?? null,
      onStartGroup: vi.fn(),
      onStopGroup: vi.fn(),
      onRestartGroup: vi.fn(),
      onUpdateGroupMetadata: vi.fn(),
      onToggleGroupCollapsed: vi.fn(),
      onAddSelectedTerminalsToGroup: vi.fn(),
      onRemoveSelectedTerminalsFromGroup:
        input.onRemoveSelectedTerminalsFromGroup ?? vi.fn(async () => undefined),
      onRemoveTerminalFromGroup: vi.fn(),
      onDissolveGroup: vi.fn()
    },
    dragging: false,
    zIndex: 0,
    selectable: true,
    deletable: true,
    selected: false,
    draggable: true,
    isConnectable: false,
    positionAbsoluteX: 288,
    positionAbsoluteY: 164
  }
}

function createTerminalBlock(
  id: string,
  name: string,
  x: number
): TerminalGroupFlowNode['data']['memberBlocks'][number] {
  return {
    id,
    type: 'terminal',
    name,
    description: 'Local shell',
    launchCommand: '',
    position: { x, y: 240 },
    size: defaultTerminalBlockSize
  }
}
