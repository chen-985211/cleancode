import { fireEvent, render, screen } from '@testing-library/react'

import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  TerminalGroupCard,
  TerminalGroupMemberRow
} from '../../../../src/contexts/block-graph/presentation/components/TerminalGroupCard'

describe('terminal group card', () => {
  it('owns group metadata editing and publishes the trimmed name', async () => {
    const onUpdateGroupMetadata = vi.fn(async () => undefined)
    render(<TerminalGroupCard data={createData({ onUpdateGroupMetadata })} memberRows={null} />)

    fireEvent.click(screen.getByRole('button', { name: '启动项目 重命名组合' }))
    fireEvent.change(screen.getByRole('textbox', { name: '组合名称' }), {
      target: { value: '  新组合  ' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存组合名称' }))

    expect(onUpdateGroupMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'development' }),
      { name: '新组合' }
    )
  })

  it('publishes runtime and structure intents without owning their execution', () => {
    const onStartGroup = vi.fn()
    const onEditGroup = vi.fn()
    render(<TerminalGroupCard data={createData({ onEditGroup, onStartGroup })} memberRows={null} />)

    fireEvent.click(screen.getByRole('button', { name: '启动项目 启动组合命令' }))
    fireEvent.click(screen.getByRole('button', { name: '启动项目 管理组合内容' }))

    expect(onStartGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 'development' }))
    expect(onEditGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 'development' }))
  })

  it('renders an injected runtime status while owning the membership removal intent', () => {
    const onRemove = vi.fn()
    render(
      <TerminalGroupMemberRow
        block={createBlock()}
        status="running"
        statusLabel="运行中"
        onRemove={onRemove}
      />
    )

    expect(screen.getByText('运行中')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'API 移出组合' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})

function createData(
  overrides: Partial<Parameters<typeof TerminalGroupCard>[0]['data']> = {}
): Parameters<typeof TerminalGroupCard>[0]['data'] {
  return {
    dropFeedback: null,
    group: createGroup(),
    isEditing: false,
    onDissolveGroup: vi.fn(async () => undefined),
    onEditGroup: vi.fn(),
    onRestartGroup: vi.fn(),
    onStartGroup: vi.fn(),
    onStopGroup: vi.fn(),
    onToggleGroupCollapsed: vi.fn(async () => undefined),
    onUpdateGroupMetadata: vi.fn(async () => undefined),
    ...overrides
  }
}

function createGroup(): TerminalGroupSnapshot {
  return {
    id: 'development',
    isCollapsed: false,
    memberBlockIds: ['api'],
    name: '启动项目',
    position: { x: 0, y: 0 },
    size: { width: 720, height: 460 },
    type: 'terminal-group'
  }
}

function createBlock(): TerminalBlockSnapshot {
  return {
    description: '',
    executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
    id: 'api',
    launchCommand: 'pnpm api',
    name: 'API',
    position: { x: 0, y: 0 },
    size: { width: 720, height: 460 },
    type: 'terminal'
  }
}
