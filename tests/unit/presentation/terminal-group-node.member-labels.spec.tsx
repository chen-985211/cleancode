import { fireEvent, render, screen } from '@testing-library/react'

import { defaultTerminalBlockSize } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { TerminalGroupNode } from '../../../src/presentation/app-shell/TerminalGroupNode'
import type {
  TerminalGroupFlowNode,
  TerminalViewState
} from '../../../src/presentation/app-shell/types'

vi.mock('@xyflow/react', () => ({
  Handle: ({ className, id }: { readonly className?: string; readonly id?: string }) => (
    <span className={className} data-handleid={id} />
  ),
  Position: { Left: 'left' }
}))

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
          data: {
            onRemoveSelectedTerminalsFromGroup,
            selectedMemberBlockIds: ['backend-terminal']
          }
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '启动项目 移出选中终端' }))

    expect(onRemoveSelectedTerminalsFromGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'development-group' })
    )
  })

  it('disables batch membership actions until matching terminals are selected', () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: false })} />)

    expect(screen.getByRole('button', { name: '启动项目 添加选中终端' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '启动项目 移出选中终端' })).toBeDisabled()
  })

  it('exposes all frequent actions directly while the group is collapsed', () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: true })} />)

    const actionNames = [
      '启动项目 启动组合命令',
      '启动项目 停止全部当前命令',
      '启动项目 重开组合终端会话',
      '启动项目 编辑组合名称',
      '启动项目 添加选中终端',
      '启动项目 移出选中终端',
      '启动项目 解散组合'
    ]

    for (const name of actionNames) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }

    expect(screen.queryByRole('button', { name: '启动项目 更多组合操作' })).not.toBeInTheDocument()
  })

  it('uses the confirmed raised-button groups and visual icon set', () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: true })} />)

    const startButton = screen.getByRole('button', { name: '启动项目 启动组合命令' })
    const stopButton = screen.getByRole('button', { name: '启动项目 停止全部当前命令' })
    const restartButton = screen.getByRole('button', { name: '启动项目 重开组合终端会话' })
    const editButton = screen.getByRole('button', { name: '启动项目 编辑组合名称' })
    const addButton = screen.getByRole('button', { name: '启动项目 添加选中终端' })
    const removeButton = screen.getByRole('button', { name: '启动项目 移出选中终端' })
    const dissolveButton = screen.getByRole('button', { name: '启动项目 解散组合' })
    const runtimeGroup = startButton.closest('[data-control-group="runtime"]')
    const membershipGroup = addButton.closest('[data-control-group="membership"]')

    expect(runtimeGroup).toContainElement(stopButton)
    expect(runtimeGroup).toContainElement(restartButton)
    expect(runtimeGroup?.querySelectorAll('[data-control-surface="raised"]')).toHaveLength(3)
    expect(editButton).toHaveAttribute('data-control-surface', 'raised')
    expect(editButton.closest('[data-control-group="membership"]')).toBeNull()
    expect(membershipGroup).toContainElement(removeButton)
    expect(dissolveButton).toHaveAttribute('data-control-surface', 'raised')

    expect(startButton.querySelector('[data-icon="group-start"]')).toMatchObject({
      dataset: expect.objectContaining({ iconGlyph: 'play', iconWeight: 'fill' })
    })
    expect(stopButton.querySelector('[data-icon="group-stop"]')).toMatchObject({
      dataset: expect.objectContaining({ iconGlyph: 'stop', iconWeight: 'fill' })
    })
    expect(restartButton.querySelector('[data-icon="group-restart"]')).toMatchObject({
      dataset: expect.objectContaining({ iconGlyph: 'arrow-clockwise', iconRole: 'restart' })
    })
    expect(editButton.querySelector('[data-icon="group-edit"]')).toHaveAttribute(
      'data-icon-glyph',
      'pencil-simple'
    )
    expect(addButton.querySelector('[data-icon="group-add"]')).toHaveAttribute(
      'data-icon-glyph',
      'stack-plus'
    )
    expect(removeButton.querySelector('[data-icon="group-remove"]')).toHaveAttribute(
      'data-icon-glyph',
      'stack-minus'
    )
    expect(dissolveButton.querySelector('[data-icon="group-dissolve"]')).toBeInTheDocument()
    expect(dissolveButton.querySelector('[data-icon-part="disconnect-accent"]')).toBeInTheDocument()
    const unlinkIcon = screen
      .getByRole('button', { name: 'Backend 移出组合' })
      .querySelector('[data-icon="group-member-unlink"]')
    expect(unlinkIcon).toHaveAttribute('data-icon-glyph', 'link-break')
  })

  it('reports the explicit disclosure state for collapsed and expanded groups', () => {
    const { rerender } = render(
      <TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: true })} />
    )

    const expandButton = screen.getByRole('button', { name: '启动项目 展开组合' })

    expect(expandButton).toHaveAttribute('aria-expanded', 'false')
    expect(expandButton).toHaveTextContent('展开')
    expect(expandButton.querySelector('[data-icon="group-expand"]')).toHaveAttribute(
      'data-icon-glyph',
      'arrows-out-simple'
    )

    rerender(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: false })} />)

    const collapseButton = screen.getByRole('button', { name: '启动项目 折叠组合' })

    expect(collapseButton).toHaveAttribute('aria-expanded', 'true')
    expect(collapseButton).toHaveTextContent('折叠')
    expect(collapseButton.querySelector('[data-icon="group-collapse"]')).toHaveAttribute(
      'data-icon-glyph',
      'arrows-in-simple'
    )
  })

  it('routes every direct group action through its existing callback', () => {
    const onStartGroup = vi.fn()
    const onStopGroup = vi.fn()
    const onRestartGroup = vi.fn()
    const onToggleGroupCollapsed = vi.fn(async () => undefined)
    const onAddSelectedTerminalsToGroup = vi.fn(async () => undefined)
    const onRemoveSelectedTerminalsFromGroup = vi.fn(async () => undefined)
    const onDissolveGroup = vi.fn(async () => undefined)

    render(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({
          isCollapsed: true,
          data: {
            selectedUngroupedTerminalBlockIds: ['docs-terminal'],
            selectedMemberBlockIds: ['backend-terminal'],
            onStartGroup,
            onStopGroup,
            onRestartGroup,
            onToggleGroupCollapsed,
            onAddSelectedTerminalsToGroup,
            onRemoveSelectedTerminalsFromGroup,
            onDissolveGroup
          }
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '启动项目 启动组合命令' }))
    fireEvent.click(screen.getByRole('button', { name: '启动项目 停止全部当前命令' }))
    fireEvent.click(screen.getByRole('button', { name: '启动项目 重开组合终端会话' }))
    fireEvent.click(screen.getByRole('button', { name: '启动项目 展开组合' }))
    fireEvent.click(screen.getByRole('button', { name: '启动项目 添加选中终端' }))
    fireEvent.click(screen.getByRole('button', { name: '启动项目 移出选中终端' }))
    fireEvent.click(screen.getByRole('button', { name: '启动项目 解散组合' }))

    const expectedGroup = expect.objectContaining({ id: 'development-group' })

    expect(onStartGroup).toHaveBeenCalledWith(expectedGroup)
    expect(onStopGroup).toHaveBeenCalledWith(expectedGroup)
    expect(onRestartGroup).toHaveBeenCalledWith(expectedGroup)
    expect(onToggleGroupCollapsed).toHaveBeenCalledWith(expectedGroup, false)
    expect(onAddSelectedTerminalsToGroup).toHaveBeenCalledWith(expectedGroup)
    expect(onRemoveSelectedTerminalsFromGroup).toHaveBeenCalledWith(expectedGroup)
    expect(onDissolveGroup).toHaveBeenCalledWith(expectedGroup)
  })

  it('explains that dissolving a group preserves its member terminals', async () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: true })} />)

    const dissolveButton = screen.getByRole('button', { name: '启动项目 解散组合' })

    expect(dissolveButton).not.toHaveAttribute('title')
    fireEvent.keyDown(document, { key: 'Tab' })
    fireEvent.focus(dissolveButton)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('解散组合，保留成员终端')
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
    expect(
      screen.queryByRole('button', { name: '启动项目 重开组合终端会话' })
    ).not.toBeInTheDocument()
  })

  it('keeps member labels available while the group is collapsed', () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: true })} />)

    expect(screen.getByRole('button', { name: 'Backend 移出组合' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Frontend 移出组合' })).toBeInTheDocument()
  })

  it('uses only the shared tooltip for a member remove action', async () => {
    render(<TerminalGroupNode {...createTerminalGroupNodeProps({ isCollapsed: true })} />)

    const removeButton = screen.getByRole('button', { name: 'Backend 移出组合' })

    expect(removeButton).not.toHaveAttribute('title')
    expect(removeButton).not.toHaveAttribute('data-cc-tooltip')
    fireEvent.keyDown(document, { key: 'Tab' })
    fireEvent.focus(removeButton)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('移出组合')
  })

  it('shows each member terminal status while the group is collapsed', () => {
    render(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({
          isCollapsed: true,
          members: [
            { id: 'idle-terminal', name: 'Idle', status: 'idle' },
            { id: 'running-terminal', name: 'Running', status: 'running' },
            { id: 'exited-terminal', name: 'Exited', status: 'exited' },
            { id: 'failed-terminal', name: 'Failed', status: 'failed' }
          ]
        })}
      />
    )

    expect(screen.getByText('Idle').parentElement).toHaveTextContent('未启动')
    expect(screen.getByText('Running').parentElement).toHaveTextContent('运行中')
    expect(screen.getByText('Exited').parentElement).toHaveTextContent('已退出')
    expect(screen.getByText('Failed').parentElement).toHaveTextContent('失败')
  })

  it('keeps aggregate terminal counts and run status out of the group header', () => {
    render(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({
          isCollapsed: true,
          members: [
            { id: 'backend-terminal', name: 'Backend', status: 'running' },
            { id: 'frontend-terminal', name: 'Frontend', status: 'running' }
          ]
        })}
      />
    )

    const titleRegion = screen.getByText('启动项目').closest('.terminal-group-node__title')

    expect(titleRegion).toHaveTextContent('启动项目')
    expect(titleRegion).not.toHaveTextContent('2 个终端')
    expect(titleRegion).not.toHaveTextContent('全部运行中')
    expect(titleRegion).not.toHaveTextContent('运行中')
  })

  it('shows drop feedback while editing group membership', () => {
    render(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({
          isCollapsed: false,
          data: { dropFeedback: 'dissolve' }
        })}
      />
    )

    expect(screen.getByText('松开后解散组合')).toBeInTheDocument()
  })

  it('uses the title as its only selection target and shows the shared selection veil', () => {
    const { container } = render(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({
          isCollapsed: true,
          data: { isSelected: true }
        })}
      />
    )

    expect(screen.getByText('启动项目').closest('.terminal-group-node__header')).toHaveAttribute(
      'data-workbench-node-title',
      'true'
    )
    expect(container.querySelector('[data-workbench-node-selection]')).toBeInTheDocument()
  })

  it('labels a collapsed group that proxies a terminal or connection approval target', () => {
    const { rerender } = render(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({
          isCollapsed: true,
          data: { approvalIntent: 'dissolve' }
        })}
      />
    )

    expect(screen.queryByText('AI 想解散')).not.toBeInTheDocument()

    rerender(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({
          isCollapsed: true,
          data: { approvalIntent: 'contains-delete' }
        })}
      />
    )

    expect(screen.getByText('包含待删除终端')).toBeInTheDocument()

    rerender(
      <TerminalGroupNode
        {...createTerminalGroupNodeProps({
          isCollapsed: true,
          data: { approvalIntent: 'contains-disconnect' }
        })}
      />
    )

    expect(screen.getByText('包含待断开依赖')).toBeInTheDocument()
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
