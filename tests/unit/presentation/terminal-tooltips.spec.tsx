import { fireEvent, render, screen } from '@testing-library/react'
import type { CSSProperties } from 'react'

import { defaultTerminalBlockSize } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { TerminalNode } from '../../../src/presentation/app-shell/TerminalNode'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types'

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  NodeResizeControl: ({ onResizeEnd, position, style }: ResizeControlProps) => (
    <span
      data-resize-position={position}
      data-testid="terminal-resize-control"
      style={style}
      onClick={() =>
        onResizeEnd?.({} as never, { x: 180, y: 140, width: 760, height: 420 } as never)
      }
    />
  ),
  NodeResizer: ({ handleStyle, isVisible }: NodeResizerProps) => (
    <>
      {isVisible
        ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((position) => (
            <span
              key={position}
              data-resize-position={position}
              data-testid="terminal-resize-control"
              style={handleStyle}
            />
          ))
        : null}
    </>
  ),
  Position: { Left: 'left', Right: 'right' }
}))

interface ResizeControlProps {
  readonly onResizeEnd?: (event: never, params: never) => void
  readonly position?: string
  readonly style?: CSSProperties
}

interface NodeResizerProps {
  readonly handleStyle?: CSSProperties
  readonly isVisible?: boolean
}

describe('terminal tooltips', () => {
  it('exposes all four corner resize controls while the terminal is not selected', () => {
    render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{ ...createTerminalNodeData(), isSelected: false }}
        dragging={false}
        zIndex={0}
        selectable
        deletable
        selected={false}
        draggable
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )

    expect(
      screen
        .getAllByTestId('terminal-resize-control')
        .map((control) => control.getAttribute('data-resize-position'))
    ).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
  })

  it('uses a generous transparent hit target for corner resizing', () => {
    render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{ ...createTerminalNodeData(), isSelected: true }}
        dragging={false}
        zIndex={0}
        selectable
        deletable
        selected
        draggable
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )

    const resizer = screen.getAllByTestId('terminal-resize-control')[0]!
    expect(resizer).toHaveStyle({
      width: '24px',
      height: '24px',
      background: 'transparent'
    })
    expect(resizer.style.borderStyle).toBe('none')
  })

  it('adds a non-interactive selection veil when the terminal is selected', () => {
    const data = createTerminalNodeData()

    render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{ ...data, isSelected: true }}
        dragging={false}
        zIndex={0}
        selectable
        deletable
        selected
        draggable
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )

    expect(document.querySelector('[data-workbench-node-selection]')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  it('selects the whole terminal only from the title area', () => {
    const onSelect = vi.fn()
    const data = { ...createTerminalNodeData(), onSelect }
    const { container } = render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={data}
        dragging={false}
        zIndex={0}
        selectable={false}
        deletable
        selected={false}
        draggable
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )

    fireEvent.click(container.querySelector('.terminal-frame')!)
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.click(container.querySelector('.terminal-node__header')!)
    expect(onSelect).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Terminal 重开空终端会话' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('submits the complete final rectangle after resizing from a top corner', () => {
    const onResizeBlock = vi.fn(async () => undefined)
    render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{ ...createTerminalNodeData(), onResizeBlock }}
        dragging={false}
        zIndex={0}
        selectable={false}
        deletable
        selected={false}
        draggable
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )

    fireEvent.click(
      screen
        .getAllByTestId('terminal-resize-control')
        .find((control) => control.getAttribute('data-resize-position') === 'top-left')!
    )

    expect(onResizeBlock).toHaveBeenCalledWith(expect.objectContaining({ id: 'terminal-1' }), {
      position: { x: 180, y: 140 },
      size: { width: 760, height: 420 }
    })
  })

  it('labels terminal icon actions with tooltip text', () => {
    render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={createTerminalNodeData()}
        dragging={false}
        zIndex={0}
        selectable
        deletable
        selected={false}
        draggable
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )

    expectTooltip('Terminal 编辑终端信息', '编辑终端信息')
    expectTooltip('Terminal 启动命令', '配置启动命令')
    expectTooltip('Terminal 停止当前命令', '停止当前命令')
    expectTooltip('Terminal 重开空终端会话', '重开空终端会话，不执行启动命令')
    expectTooltip('Terminal 删除终端', '删除终端')

    const restartButton = screen.getByRole('button', { name: 'Terminal 重开空终端会话' })
    expect(restartButton.querySelector('[data-icon="group-restart"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Terminal 更多终端操作' })).not.toBeInTheDocument()

    const deleteButton = screen.getByRole('button', { name: 'Terminal 删除终端' })
    expect(deleteButton.querySelector('.lucide-x')).not.toBeNull()
    expect(deleteButton.querySelector('.lucide-trash-2')).toBeNull()
  })

  it('orders terminal actions like the shared terminal group actions', () => {
    render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={createTerminalNodeData()}
        dragging={false}
        zIndex={0}
        selectable
        deletable
        selected={false}
        draggable
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )

    const actionNames = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))

    expect(actionNames).toEqual([
      'Terminal 从此处运行终端流程',
      'Terminal 启动命令',
      'Terminal 停止当前命令',
      'Terminal 重开空终端会话',
      'Terminal 编辑终端信息',
      'Terminal 删除终端'
    ])
  })
})

function createTerminalNodeData(): TerminalFlowNode['data'] {
  const block = {
    id: 'terminal-1',
    type: 'terminal' as const,
    name: 'Terminal',
    description: 'Local shell',
    launchCommand: '',
    position: { x: 240, y: 180 },
    size: defaultTerminalBlockSize
  }

  return {
    block,
    session: { sessionId: null, status: 'idle', output: '' },
    isSelected: false,
    isTerminalGroupSelectionMode: false,
    canSelectForTerminalGroup: true,
    isNavigationHighlighted: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onQuickLaunch: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onUpdateMetadata: vi.fn(),
    onInput: vi.fn(),
    onResize: vi.fn(),
    onResizeBlock: vi.fn(),
    onSelect: vi.fn(),
    onToggleTerminalGroupCandidate: vi.fn()
  }
}

function expectTooltip(accessibleName: string, tooltip: string): void {
  expect(screen.getByRole('button', { name: accessibleName })).toHaveAttribute(
    'data-cc-tooltip',
    tooltip
  )
}
