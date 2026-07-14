import { fireEvent, render, screen } from '@testing-library/react'
import type { CSSProperties } from 'react'

import { AgentNode } from '../../../src/presentation/app-shell/AgentNode'
import type { AgentConsoleFlowNode } from '../../../src/presentation/app-shell/types'

vi.mock('@xyflow/react', () => ({
  NodeResizeControl: ({ onResizeEnd, position, style }: ResizeControlProps) => (
    <span
      data-resize-position={position}
      data-testid="agent-resize-control"
      style={style}
      onClick={() =>
        onResizeEnd?.({} as never, { x: 180, y: 140, width: 780, height: 500 } as never)
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
              data-testid="agent-resize-control"
              style={handleStyle}
            />
          ))
        : null}
    </>
  )
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

vi.mock('../../../src/presentation/app-shell/AgentConsole', () => ({
  AgentConsole: () => null
}))

describe('Agent node resizing', () => {
  it('keeps corner resizing available when the Agent is not selected', () => {
    renderAgentNode(false)

    expect(screen.getAllByTestId('agent-resize-control')).toHaveLength(4)
  })

  it('uses a generous transparent hit target for corner resizing', () => {
    renderAgentNode(true)

    const resizer = screen.getAllByTestId('agent-resize-control')[0]!
    expect(resizer).toHaveStyle({
      width: '24px',
      height: '24px',
      background: 'transparent'
    })
    expect(resizer.style.borderStyle).toBe('none')
  })

  it('exposes all four corner resize controls without visible control points', () => {
    renderAgentNode(true)

    expect(
      screen
        .getAllByTestId('agent-resize-control')
        .map((control) => control.getAttribute('data-resize-position'))
    ).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
  })

  it('submits the complete final rectangle after resizing from a top corner', () => {
    const onResize = vi.fn(async () => undefined)
    renderAgentNode(false, onResize)

    fireEvent.click(
      screen
        .getAllByTestId('agent-resize-control')
        .find((control) => control.getAttribute('data-resize-position') === 'top-left')!
    )

    expect(onResize).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'agent-1' }), {
      position: { x: 180, y: 140 },
      size: { width: 780, height: 500 }
    })
  })
})

function renderAgentNode(
  selected: boolean,
  onResize: NonNullable<AgentConsoleFlowNode['data']['onResize']> = vi.fn(async () => undefined)
): void {
  render(
    <AgentNode
      id="agent-1"
      type="agentConsole"
      data={{
        agent: {
          agentId: 'agent-1',
          cleancodeMcpEnabled: true,
          layout: {
            position: { x: 240, y: 180 },
            size: { width: 720, height: 460 }
          },
          name: 'Agent 1',
          projectId: 'project-1',
          workspaceName: 'main'
        },
        currentWorkbench: null,
        currentWorkspace: null,
        onGraphUpdated: vi.fn(),
        onMcpCapabilityChange: vi.fn(async () => undefined),
        onRemove: vi.fn(async () => undefined),
        onRename: vi.fn(async () => undefined),
        onResize
      }}
      dragging={false}
      zIndex={0}
      selectable
      deletable
      selected={selected}
      draggable
      isConnectable={false}
      positionAbsoluteX={240}
      positionAbsoluteY={180}
    />
  )
}
