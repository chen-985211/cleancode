import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { defaultTerminalBlockSize } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import type { TerminalViewState } from '../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'
import { TerminalGroupNode } from '../../../src/presentation/app-shell/workbench/nodes/terminal-group/TerminalGroupNode'
import type { TerminalGroupFlowNode } from '../../../src/presentation/app-shell/types/terminalGroupFlowNode'

vi.mock('@xyflow/react', () => ({
  Handle: ({ className, id }: { readonly className?: string; readonly id?: string }) => (
    <span className={className} data-handleid={id} />
  ),
  Position: { Left: 'left' }
}))

describe('terminal group member labels', () => {
  it.each([false, true])(
    'keeps the five group controls in the same order, collapsed=%s',
    (isCollapsed) => {
      const { container } = render(
        <TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed })} />
      )
      expect(container.querySelectorAll('.terminal-group-node__material')).toHaveLength(1)
      expect(
        screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
      ).toEqual(
        isCollapsed
          ? ['启动项目 展开组合']
          : [
              '启动项目 启动组合命令',
              '启动项目 停止全部当前命令',
              '启动项目 重开组合终端会话',
              '启动项目 更多组合操作',
              '启动项目 折叠组合'
            ]
      )
      expect(
        screen.queryByRole('button', { name: /管理组合内容|移出组合/ })
      ).not.toBeInTheDocument()
    }
  )

  it('keeps disclosure icons and accessible expanded state synchronized', () => {
    const { rerender } = render(
      <TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: true })} />
    )
    const expand = screen.getByRole('button', { name: '启动项目 展开组合' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(expand.querySelector('[data-icon-glyph]')).toHaveAttribute('data-icon-glyph', 'plus')
    rerender(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: false })} />)
    const collapse = screen.getByRole('button', { name: '启动项目 折叠组合' })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    expect(collapse.querySelector('[data-icon-glyph]')).toHaveAttribute('data-icon-glyph', 'minus')
  })

  it('routes runtime and disclosure actions through the existing callbacks', () => {
    const props = createTerminalGroupNodeProps({ isCollapsed: false })
    render(<TerminalGroupNode {...props} />)
    for (const action of ['启动组合命令', '停止全部当前命令', '重开组合终端会话', '折叠组合']) {
      fireEvent.click(screen.getByRole('button', { name: `启动项目 ${action}` }))
    }
    const group = expect.objectContaining({ id: 'development-group' })
    expect(props.data.onStartGroup).toHaveBeenCalledWith(group)
    expect(props.data.onStopGroup).toHaveBeenCalledWith(group)
    expect(props.data.onRestartGroup).toHaveBeenCalledWith(group)
    expect(props.data.onToggleGroupCollapsed).toHaveBeenCalledWith(group, true)
  })

  it('supports menu keyboard navigation, Escape and focus return', () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: false })} />)
    const trigger = screen.getByRole('button', { name: '启动项目 更多组合操作' })
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: '重命名组合' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: '解散组合' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('explains that dissolving preserves terminals and publishes the existing dissolve intent', async () => {
    const props = createTerminalGroupNodeProps({ isCollapsed: false })
    render(<TerminalGroupNode {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '启动项目 更多组合操作' }))
    const dissolve = screen.getByRole('menuitem', { name: '解散组合' })
    fireEvent.pointerDown(dissolve)
    expect(dissolve).toBeVisible()
    fireEvent.pointerUp(dissolve)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(await screen.findByRole('tooltip')).toHaveTextContent('解散组合，保留成员终端')
    fireEvent.click(dissolve)
    expect(props.data.onDissolveGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'development-group' })
    )
  })

  it.each([false])('renames without a member management panel, collapsed=%s', (isCollapsed) => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed })} />)
    fireEvent.click(screen.getByRole('button', { name: '启动项目 更多组合操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名组合' }))
    const input = screen.getByRole('textbox', { name: '组合名称' })
    expect(input).toHaveFocus()
    expect(input).toHaveValue('启动项目')
    expect(screen.getByRole('button', { name: '保存组合名称' })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('prevents duplicate name saves and disables cancellation until the save completes', async () => {
    let resolveSave!: () => void
    const onUpdateGroupMetadata = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        })
    )
    render(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({ isCollapsed: false, data: { onUpdateGroupMetadata } })}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '启动项目 更多组合操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名组合' }))
    fireEvent.change(screen.getByRole('textbox', { name: '组合名称' }), {
      target: { value: '开发服务' }
    })
    const save = screen.getByRole('button', { name: '保存组合名称' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(onUpdateGroupMetadata).toHaveBeenCalledOnce()
    expect(save).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消编辑组合名称' })).toBeDisabled()
    resolveSave()
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
  })

  it('collapses to one application identity without a member list or repeated statuses', () => {
    const { container } = render(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({
          isCollapsed: true,
          members: [{ id: 'running', name: 'Running', status: 'running' }]
        })}
      />
    )
    expect(screen.getByText('启动项目')).toBeInTheDocument()
    expect(screen.queryByText('Running')).not.toBeInTheDocument()
    expect(screen.queryByText('运行中')).not.toBeInTheDocument()
    expect(container.querySelector('.terminal-group-node__members')).toBeNull()
  })

  it.each(['join', 'leave'] as const)(
    'uses a static highlight and concise %s preview with fixed geometry',
    (dropFeedback) => {
      const { container } = render(
        <TerminalGroupNode
          {...createTerminalGroupNodeProps({ isCollapsed: false, data: { dropFeedback } })}
        />
      )
      expect(screen.getByRole('status')).toHaveTextContent(
        dropFeedback === 'join' ? '松手加入组合' : '松手移出组合'
      )
      expect(container.querySelector('.terminal-group-node')).toHaveClass(
        `terminal-group-node--drop-${dropFeedback}`
      )
      expect(container.querySelector('.terminal-group-drop-spring--active')).toBeNull()
    }
  )

  it('shows a passive drop hint for an empty group', () => {
    render(
      <TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: false, members: [] })} />
    )
    expect(screen.getByText('拖入终端或流程')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /添加终端或流程/ })).not.toBeInTheDocument()
  })

  it('keeps approval labels and the shared selection veil on the visible group', () => {
    const { container } = render(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({
          isCollapsed: true,
          data: { isSelected: true, approvalIntent: 'contains-disconnect' }
        })}
      />
    )
    expect(screen.getByText('包含待断开依赖')).toBeInTheDocument()
    expect(container.querySelector('[data-workbench-node-selection]')).toBeInTheDocument()
    expect(screen.getByText('启动项目').closest('.terminal-group-node__header')).toHaveAttribute(
      'data-workbench-node-title',
      'true'
    )
  })
})

function createTerminalGroupNodeProps(input: {
  readonly isCollapsed: boolean
  readonly members?: readonly TerminalGroupMemberInput[]
  readonly data?: Partial<TerminalGroupFlowNode['data']>
}): Parameters<typeof TerminalGroupNode>[0] {
  const members = input.members ?? [
    { id: 'backend-terminal', name: 'Backend', status: 'idle' },
    { id: 'frontend-terminal', name: 'Frontend', status: 'idle' }
  ]

  return {
    id: 'development-group',
    type: 'terminalGroup',
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: 'terminal-group',
        objectId: 'development-group'
      },
      group: {
        id: 'development-group',
        type: 'terminal-group',
        name: '启动项目',
        position: { x: 288, y: 164 },
        size: { width: 984, height: input.isCollapsed ? 150 : 458 },
        isCollapsed: input.isCollapsed,
        memberBlockIds: members.map((member) => member.id)
      },
      memberBlocks: members.map((member, index) =>
        createTerminalBlock(member.id, member.name, 320 + index * 500)
      ),
      memberStates: Object.fromEntries(
        members.map((member) => [member.id, createTerminalState(member.status)])
      ),
      selectedUngroupedTerminalBlockIds: [],
      selectedMemberBlockIds: [],
      isSelected: false,
      dropFeedback: null,
      onStartGroup: vi.fn(),
      onStopGroup: vi.fn(),
      onRestartGroup: vi.fn(),
      onUpdateGroupMetadata: vi.fn(),
      onToggleGroupCollapsed: vi.fn(),
      onAddSelectedTerminalsToGroup: vi.fn(),
      onRemoveSelectedTerminalsFromGroup: vi.fn(async () => undefined),
      onRemoveTerminalFromGroup: vi.fn(),
      onDissolveGroup: vi.fn(),
      ...input.data
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

interface TerminalGroupMemberInput {
  readonly id: string
  readonly name: string
  readonly status: TerminalViewState['status']
}

function createTerminalState(status: TerminalViewState['status']): TerminalViewState {
  return {
    sessionId: status === 'idle' ? null : `${status}-session`,
    status,
    output: ''
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
