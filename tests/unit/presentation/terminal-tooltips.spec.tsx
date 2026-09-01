import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CSSProperties } from 'react'

import { defaultTerminalBlockSize } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { TerminalNode } from '../../../src/presentation/app-shell/TerminalNode'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types/terminalFlowNode'

vi.mock('@xyflow/react', () => ({
  Handle: () => <span data-testid="terminal-flow-handle" />,
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
  it('keeps React Flow handles outside the animated terminal surface', () => {
    const { container } = render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{
          ...createTerminalNodeData(),
          objectMotion: {
            id: 'group-expand:terminal-1',
            kind: 'group-expand',
            offset: { x: 180, y: 120 }
          }
        }}
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

    const anchor = container.querySelector('.terminal-node-anchor')!
    const animatedSurface = container.querySelector('.terminal-node')!

    expect(anchor).not.toBe(animatedSurface)
    expect(anchor).toContainElement(screen.getAllByTestId('terminal-flow-handle')[0])
    expect(animatedSurface).not.toContainElement(screen.getAllByTestId('terminal-flow-handle')[0])
    expect(animatedSurface).not.toContainElement(
      screen.getAllByTestId('terminal-resize-control')[0]
    )
  })

  it('removes a parked collapsed member surface from interaction and accessibility', () => {
    const { container } = render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{ ...createTerminalNodeData(), isParkedInCollapsedGroup: true }}
        dragging={false}
        zIndex={0}
        selectable={false}
        deletable
        selected={false}
        draggable={false}
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )

    const anchor = container.querySelector('.terminal-node-anchor')!
    expect(anchor).toHaveClass('terminal-node-anchor--parked')
    expect(anchor).toHaveAttribute('aria-hidden', 'true')
    expect(anchor).toHaveAttribute('inert')
  })

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
    expect(document.querySelector('[data-terminal-block-id]')).toHaveClass(
      'terminal-node--selected'
    )
  })

  it.each([
    ['without Shift', false],
    ['with Shift', true]
  ] as const)('selects the whole terminal only from the title area %s', (_label, shiftKey) => {
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

    fireEvent.click(container.querySelector('.terminal-frame')!, { shiftKey })
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.click(container.querySelector('.terminal-node__header')!, { shiftKey })
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(data.block)

    fireEvent.click(screen.getByRole('button', { name: 'Terminal 重开空终端会话' }), {
      shiftKey
    })
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

  it('labels terminal icon actions with tooltip text', async () => {
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

    await expectTooltip('Terminal 编辑终端信息', '编辑终端信息')
    await expectTooltip('Terminal 启动命令', '配置启动命令')
    await expectTooltip('Terminal 停止当前命令', '停止当前命令')
    await expectTooltip('Terminal 重开空终端会话', '重开空终端会话，不执行启动命令')
    await expectTooltip('Terminal 删除终端', '删除终端')

    const restartButton = screen.getByRole('button', { name: 'Terminal 重开空终端会话' })
    expect(restartButton.querySelector('[data-icon-role="restart"]')).toHaveAttribute(
      'data-icon-glyph',
      'arrow-clockwise'
    )
    expect(screen.queryByRole('button', { name: 'Terminal 更多终端操作' })).not.toBeInTheDocument()

    expect(document.querySelector('[data-icon="terminal-node"]')).toHaveAttribute(
      'data-icon-glyph',
      'terminal-window'
    )
    expect(
      screen
        .getByRole('button', { name: 'Terminal 启动命令' })
        .querySelector('[data-icon="terminal-launch"]')
    ).toMatchObject({
      dataset: expect.objectContaining({ iconGlyph: 'play', iconWeight: 'fill' })
    })
    expect(
      screen
        .getByRole('button', { name: 'Terminal 停止当前命令' })
        .querySelector('[data-icon="terminal-stop-command"]')
    ).toMatchObject({
      dataset: expect.objectContaining({ iconGlyph: 'stop', iconWeight: 'fill' })
    })
    expect(
      screen
        .getByRole('button', { name: 'Terminal 编辑终端信息' })
        .querySelector('[data-icon="terminal-edit"]')
    ).toHaveAttribute('data-icon-glyph', 'pencil-simple')

    const deleteButton = screen.getByRole('button', { name: 'Terminal 删除终端' })
    expect(deleteButton.querySelector('[data-icon="terminal-delete"]')).toHaveAttribute(
      'data-icon-glyph',
      'trash'
    )
  })

  it('turns the workflow action into a scoped stop action on the active run root', async () => {
    const onStopWorkflow = vi.fn()
    render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{
          ...createTerminalNodeData(),
          isActiveWorkflowRoot: true,
          isStoppingWorkflow: false,
          onStopWorkflow
        }}
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

    const stopWorkflow = screen.getByRole('button', { name: 'Terminal 停止本次运行' })

    expect(stopWorkflow.querySelector('[data-icon="terminal-workflow-stop"]')).toMatchObject({
      dataset: expect.objectContaining({ iconGlyph: 'stop', iconRole: 'stop', iconWeight: 'fill' })
    })

    fireEvent.keyDown(document, { key: 'Tab' })
    fireEvent.focus(stopWorkflow)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('停止本次运行')
    fireEvent.click(stopWorkflow)
    expect(onStopWorkflow).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Terminal 停止当前命令' })).toBeInTheDocument()
  })

  it('explains the workflow retention restriction to pointer and keyboard users', async () => {
    const onToggleRetention = vi.fn()
    render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{
          ...createTerminalNodeData(),
          session: {
            sessionId: 'workflow-session',
            status: 'running',
            output: '',
            sessionKind: 'workflow',
            retentionPolicy: 'terminate-on-application-exit'
          },
          onToggleRetention
        }}
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

    const explanation = '工作流会话会随应用退出停止，不能跨应用保留'
    const retentionButton = screen.getByRole('button', {
      name: `Terminal ${explanation}`
    })
    expect(retentionButton).toHaveAttribute('aria-disabled', 'true')
    expect(retentionButton).not.toBeDisabled()

    fireEvent.pointerMove(retentionButton)
    fireEvent.pointerEnter(retentionButton)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(explanation)
    fireEvent.pointerLeave(retentionButton)
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

    fireEvent.keyDown(document, { key: 'Tab' })
    fireEvent.focus(retentionButton)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(explanation)
    fireEvent.click(retentionButton)
    expect(onToggleRetention).not.toHaveBeenCalled()
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
      'Terminal 应用退出后继续运行此会话',
      'Terminal 重开空终端会话',
      'Terminal 编辑终端信息',
      'Terminal 删除终端'
    ])
  })

  it('submits metadata and execution configuration through one definition update', async () => {
    const onUpdateDefinition = vi.fn(async () => undefined)
    render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{ ...createTerminalNodeData(), onUpdateDefinition }}
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

    const editButton = screen.getByRole('button', { name: 'Terminal 编辑终端信息' })

    fireEvent.click(editButton)

    expect(editButton).toHaveAttribute('aria-expanded', 'true')
    expect(editButton).toHaveAttribute('aria-pressed', 'true')
    expect(editButton).toHaveAttribute('aria-controls', 'terminal-metadata-form-terminal-1')
    expect(screen.getByRole('form', { name: '编辑终端信息' })).toHaveAttribute(
      'id',
      'terminal-metadata-form-terminal-1'
    )
    fireEvent.change(screen.getByLabelText('启动命令'), { target: { value: ' pnpm dev ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存终端信息' }))

    await waitFor(() =>
      expect(onUpdateDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'terminal-1' }),
        {
          name: 'Terminal',
          description: 'Local shell',
          launchCommand: 'pnpm dev',
          executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null }
        }
      )
    )
    expect(onUpdateDefinition).toHaveBeenCalledTimes(1)
  })

  it('shows a semantic action icon for both unselected and selected group candidates', () => {
    const data = createTerminalNodeData()
    const { rerender } = render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{
          ...data,
          isTerminalGroupSelectionMode: true,
          canSelectForTerminalGroup: true
        }}
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

    const selectButton = screen.getByRole('button', { name: 'Terminal 选择终端' })

    expect(selectButton).toHaveAttribute('aria-pressed', 'false')
    expect(selectButton.querySelector('[data-icon-role="group-add"]')).toBeInTheDocument()

    rerender(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{
          ...data,
          isSelected: true,
          isTerminalGroupSelectionMode: true,
          canSelectForTerminalGroup: true
        }}
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

    const selectedButton = screen.getByRole('button', { name: 'Terminal 已选择终端' })

    expect(selectedButton).toHaveAttribute('aria-pressed', 'true')
    expect(selectedButton.querySelector('[data-icon-role="confirm"]')).toBeInTheDocument()
  })

  it('opens the existing launch-command editor for an external quick-execution request', async () => {
    const data = createTerminalNodeData()
    const { rerender } = render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={data}
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

    expect(screen.queryByLabelText('启动命令')).not.toBeInTheDocument()

    rerender(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{ ...data, launchCommandEditRequestId: 1 }}
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

    await waitFor(() => expect(screen.getByLabelText('启动命令')).toHaveFocus())
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
    identity: {
      projectId: 'project-1',
      workspaceId: 'main',
      objectKind: 'terminal',
      objectId: 'terminal-1'
    },
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
    onUpdateDefinition: vi.fn(),
    onInput: vi.fn(),
    onResize: vi.fn(),
    onResizeBlock: vi.fn(),
    onSelect: vi.fn(),
    onToggleTerminalGroupCandidate: vi.fn()
  }
}

async function expectTooltip(accessibleName: string, tooltip: string): Promise<void> {
  const button = screen.getByRole('button', { name: accessibleName })
  expect(button).not.toHaveAttribute('title')
  expect(button).not.toHaveAttribute('data-cc-tooltip')

  fireEvent.keyDown(document, { key: 'Tab' })
  fireEvent.focus(button)
  expect(await screen.findByRole('tooltip')).toHaveTextContent(tooltip)
  fireEvent.blur(button)
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
}
