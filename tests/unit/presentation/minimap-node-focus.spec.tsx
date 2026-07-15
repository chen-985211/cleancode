import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'

import type { TerminalBlockSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { useMinimapNodeFocus } from '../../../src/presentation/app-shell/useMinimapNodeFocus'

describe('minimap node focus', () => {
  it('uses the longer capped transition when a minimap terminal is far from the current view', () => {
    const setCenter = vi.fn(async () => true)
    const terminal = createTerminalBlock()
    const instance = createReactFlowInstance(terminal, setCenter)

    render(<MinimapFocusHarness instance={instance} terminal={terminal} />)

    fireEvent.click(screen.getByRole('button', { name: '聚焦远端终端' }))

    expect(setCenter).toHaveBeenCalledWith(4_200, 3_150, {
      zoom: 1,
      duration: 300,
      interpolate: 'linear'
    })
  })
})

interface MinimapFocusHarnessProps {
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly terminal: TerminalBlockSnapshot
}

function MinimapFocusHarness({ instance, terminal }: MinimapFocusHarnessProps) {
  const reactFlowInstanceRef = useRef(instance)
  const { focusWorkbenchNode } = useMinimapNodeFocus({
    terminalBlocksById: new Map([[terminal.id, terminal]]),
    terminalGroupsById: new Map(),
    reactFlowInstanceRef,
    setSelectedAgentId: vi.fn(),
    setHoveredTerminalBlockId: vi.fn(),
    setSelectedTerminalBlockId: vi.fn(),
    setSelectedTerminalBlockIds: vi.fn(),
    setSelectedTerminalGroupId: vi.fn()
  })

  return (
    <button type="button" onClick={() => focusWorkbenchNode(terminal.id)}>
      聚焦远端终端
    </button>
  )
}

function createReactFlowInstance(
  terminal: TerminalBlockSnapshot,
  setCenter: ReturnType<typeof vi.fn>
): ReactFlowInstance<WorkbenchFlowNode, Edge> {
  return {
    getNode: () => ({
      id: terminal.id,
      data: { kind: 'terminalBlock', block: terminal },
      position: terminal.position,
      measured: terminal.size,
      type: 'terminal'
    }),
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    getZoom: () => 1,
    setCenter
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
}

function createTerminalBlock(): TerminalBlockSnapshot {
  return {
    id: 'terminal-far-away',
    type: 'terminal',
    name: '远端终端',
    description: '',
    launchCommand: '',
    position: { x: 4_000, y: 3_000 },
    size: { width: 400, height: 300 },
    executionConfig: {
      mode: 'task',
      successExitCodes: [0],
      timeoutMs: null
    }
  }
}
