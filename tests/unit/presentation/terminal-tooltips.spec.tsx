import { render, screen } from '@testing-library/react'

import { defaultTerminalBlockSize } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { TerminalNode } from '../../../src/presentation/app-shell/TerminalNode'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types'

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  NodeResizer: () => null,
  Position: { Left: 'left', Right: 'right' }
}))

describe('terminal tooltips', () => {
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
    expectTooltip('Terminal 停止当前命令', '停止当前命令')
    expectTooltip('Terminal 重启终端', '重启终端')
    expectTooltip('Terminal 删除终端', '删除终端')
  })
})

function createTerminalNodeData(): TerminalFlowNode['data'] {
  const block = {
    id: 'terminal-1',
    type: 'terminal' as const,
    name: 'Terminal',
    description: 'Local shell',
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
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onUpdateMetadata: vi.fn(),
    onInput: vi.fn(),
    onResize: vi.fn(),
    onResizeBlock: vi.fn(),
    onToggleTerminalGroupCandidate: vi.fn()
  }
}

function expectTooltip(accessibleName: string, tooltip: string): void {
  expect(screen.getByRole('button', { name: accessibleName })).toHaveAttribute(
    'data-cc-tooltip',
    tooltip
  )
}
