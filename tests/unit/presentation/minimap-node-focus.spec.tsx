import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'

import type { WorkspaceAgentSnapshot } from '../../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { useMinimapNodeFocus } from '../../../src/presentation/app-shell/coordinators/useMinimapNodeFocus'

describe('minimap node focus', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('centers a far minimap terminal through the shared viewport controller', () => {
    const setViewport = vi.fn(async () => true)
    const terminal = createTerminalBlock()
    const instance = createReactFlowInstance(createTerminalNode(terminal), setViewport)

    render(
      <MinimapFocusHarness
        instance={instance}
        nodeId={terminal.id}
        terminalBlocksById={new Map([[terminal.id, terminal]])}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '聚焦远端终端' }))

    expect(setViewport).toHaveBeenCalledWith({ x: -3_720, y: -2_830, zoom: 1 }, { duration: 0 })
  })

  it('restores a readable zoom when a compact minimap target is too small', () => {
    const setViewport = vi.fn(async () => true)
    const terminal = createTerminalBlock()
    const instance = createReactFlowInstance(createTerminalNode(terminal), setViewport, 0.5)

    render(
      <MinimapFocusHarness
        instance={instance}
        nodeId={terminal.id}
        terminalBlocksById={new Map([[terminal.id, terminal]])}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '聚焦远端终端' }))

    const [viewport] = setViewport.mock.calls[0] as unknown as [{ readonly zoom: number }]
    expect(viewport.zoom).toBe(0.9)
  })

  it('zooms out enough to keep an oversized minimap terminal inside the focus safe frame', () => {
    const setViewport = vi.fn(async () => true)
    const terminal = createTerminalBlock({ width: 1_400, height: 1_000 })
    const instance = createReactFlowInstance(createTerminalNode(terminal), setViewport, 0.9)

    render(
      <MinimapFocusHarness
        instance={instance}
        nodeId={terminal.id}
        terminalBlocksById={new Map([[terminal.id, terminal]])}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '聚焦远端终端' }))

    expect(setViewport).toHaveBeenCalledOnce()
    const [viewport] = setViewport.mock.calls[0] as unknown as [
      { readonly x: number; readonly y: number; readonly zoom: number }
    ]
    expect(viewport.x).toBeCloseTo(-1_565.44, 2)
    expect(viewport.y).toBeCloseTo(-1_203.2, 2)
    expect(viewport.zoom).toBeCloseTo(0.4352, 4)
  })

  it('locates a minimap target without spatial motion when reduced motion is preferred', () => {
    const setViewport = vi.fn(async () => true)
    const terminal = createTerminalBlock()
    const instance = createReactFlowInstance(createTerminalNode(terminal), setViewport)

    render(
      <MinimapFocusHarness
        instance={instance}
        nodeId={terminal.id}
        terminalBlocksById={new Map([[terminal.id, terminal]])}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '聚焦远端终端' }))

    expect(setViewport).toHaveBeenCalledWith({ x: -3_720, y: -2_830, zoom: 1 }, { duration: 0 })
  })

  it('activates xterm input after locating a terminal from the minimap', async () => {
    vi.useFakeTimers()

    try {
      const setViewport = vi.fn(async () => true)
      const terminal = createTerminalBlock()
      const instance = createReactFlowInstance(createTerminalNode(terminal), setViewport)

      render(
        <>
          <MinimapFocusHarness
            action="activateThenLocateFromMinimap"
            instance={instance}
            nodeId={terminal.id}
            terminalBlocksById={new Map([[terminal.id, terminal]])}
          />
          <div data-terminal-block-id={terminal.id}>
            <button className="terminal-viewport" type="button">
              终端视口
            </button>
            <textarea className="xterm-helper-textarea" aria-label="终端输入" />
          </div>
        </>
      )

      const navigationTarget = screen.getByRole('button', { name: '聚焦远端终端' })
      navigationTarget.focus()
      fireEvent.click(navigationTarget)
      await vi.advanceTimersByTimeAsync(350)

      expect(screen.getByLabelText('终端输入')).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it('still activates xterm input for an explicit terminal focus request', async () => {
    vi.useFakeTimers()

    try {
      const setViewport = vi.fn(async () => true)
      const terminal = createTerminalBlock()
      const instance = createReactFlowInstance(createTerminalNode(terminal), setViewport)

      render(
        <>
          <MinimapFocusHarness
            action="activateTerminal"
            instance={instance}
            nodeId={terminal.id}
            terminalBlocksById={new Map([[terminal.id, terminal]])}
          />
          <div data-terminal-block-id={terminal.id}>
            <button className="terminal-viewport" type="button">
              终端视口
            </button>
            <textarea className="xterm-helper-textarea" aria-label="终端输入" />
          </div>
        </>
      )

      fireEvent.click(screen.getByRole('button', { name: '聚焦远端终端' }))
      await vi.advanceTimersByTimeAsync(25)

      expect(screen.getByLabelText('终端输入')).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not steal focus from an editor opened while terminal input projection is pending', async () => {
    vi.useFakeTimers()

    try {
      const setViewport = vi.fn(async () => true)
      const terminal = createTerminalBlock()
      const instance = createReactFlowInstance(createTerminalNode(terminal), setViewport)

      render(
        <>
          <MinimapFocusHarness
            action="activateTerminal"
            instance={instance}
            nodeId={terminal.id}
            terminalBlocksById={new Map([[terminal.id, terminal]])}
          />
          <div data-terminal-block-id={terminal.id}>
            <textarea className="xterm-helper-textarea" aria-label="终端输入" />
          </div>
          <input aria-label="分支名称" />
        </>
      )

      fireEvent.click(screen.getByRole('button', { name: '聚焦远端终端' }))
      screen.getByLabelText('分支名称').focus()
      await vi.advanceTimersByTimeAsync(2_000)

      expect(screen.getByLabelText('分支名称')).toHaveFocus()
      expect(screen.getByLabelText('终端输入')).not.toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels pending activation when another terminal input receives focus', async () => {
    vi.useFakeTimers()

    try {
      const setViewport = vi.fn(async () => true)
      const terminal = createTerminalBlock()
      const instance = createReactFlowInstance(createTerminalNode(terminal), setViewport)

      render(
        <>
          <MinimapFocusHarness
            action="activateTerminal"
            instance={instance}
            nodeId={terminal.id}
            terminalBlocksById={new Map([[terminal.id, terminal]])}
          />
          <div data-terminal-block-id={terminal.id}>
            <textarea className="xterm-helper-textarea" aria-label="目标终端输入" />
          </div>
          <div data-terminal-block-id="other-terminal">
            <textarea className="xterm-helper-textarea" aria-label="其他终端输入" />
          </div>
        </>
      )

      fireEvent.click(screen.getByRole('button', { name: '聚焦远端终端' }))
      screen.getByLabelText('其他终端输入').focus()
      await vi.advanceTimersByTimeAsync(2_000)

      expect(screen.getByLabelText('其他终端输入')).toHaveFocus()
      expect(screen.getByLabelText('目标终端输入')).not.toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it('replaces pending terminal input activation when the minimap locates an Agent', async () => {
    vi.useFakeTimers()

    try {
      const setViewport = vi.fn(async () => true)
      const terminal = createTerminalBlock()
      const agentNode = createAgentNode()
      const instance = createReactFlowInstance(
        [createTerminalNode(terminal), agentNode],
        setViewport
      )

      render(
        <>
          <MinimapFocusHarness
            action="activateThenLocateFromMinimap"
            instance={instance}
            nodeId={agentNode.id}
            terminalToActivateId={terminal.id}
            terminalBlocksById={new Map([[terminal.id, terminal]])}
          />
          <div data-terminal-block-id={terminal.id}>
            <textarea className="xterm-helper-textarea" aria-label="终端输入" />
          </div>
          <div data-agent-console-node="oversized-agent">
            <textarea className="xterm-helper-textarea" aria-label="Agent 输入" />
          </div>
        </>
      )

      const navigationTarget = screen.getByRole('button', { name: '聚焦远端终端' })
      navigationTarget.focus()
      fireEvent.click(navigationTarget)
      await vi.advanceTimersByTimeAsync(350)

      expect(screen.getByLabelText('终端输入')).not.toHaveFocus()
      expect(screen.getByLabelText('Agent 输入')).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['Agent', createAgentNode()],
    ['折叠组合', createTerminalGroupNode()]
  ] as const)('applies the same safe frame to an oversized %s', (_kind, node) => {
    const setViewport = vi.fn(async () => true)
    const instance = createReactFlowInstance(node, setViewport, 0.9)
    const terminalGroupsById =
      node.type === 'terminalGroup'
        ? new Map([[node.data.group.id, node.data.group]])
        : new Map<string, TerminalGroupSnapshot>()

    render(
      <MinimapFocusHarness
        instance={instance}
        nodeId={node.id}
        terminalGroupsById={terminalGroupsById}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '聚焦远端终端' }))

    const [viewport] = setViewport.mock.calls[0] as unknown as [{ readonly zoom: number }]
    expect(viewport.zoom).toBeCloseTo(0.4352, 4)
  })
})

interface MinimapFocusHarnessProps {
  readonly action?: 'activateTerminal' | 'activateThenLocateFromMinimap' | 'locateFromMinimap'
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly nodeId: string
  readonly terminalToActivateId?: string
  readonly terminalBlocksById?: ReadonlyMap<string, TerminalBlockSnapshot>
  readonly terminalGroupsById?: ReadonlyMap<string, TerminalGroupSnapshot>
}

function MinimapFocusHarness({
  action = 'locateFromMinimap',
  instance,
  nodeId,
  terminalToActivateId = nodeId,
  terminalBlocksById = new Map(),
  terminalGroupsById = new Map()
}: MinimapFocusHarnessProps) {
  const reactFlowInstanceRef = useRef(instance)
  const { focusTerminalBlock, focusWorkbenchNode } = useMinimapNodeFocus({
    terminalBlocksById,
    terminalGroupsById,
    reactFlowInstanceRef,
    setSelectedAgentId: vi.fn(),
    setHoveredTerminalBlockId: vi.fn(),
    setSelectedTerminalBlockId: vi.fn(),
    setSelectedTerminalBlockIds: vi.fn(),
    setSelectedTerminalGroupId: vi.fn()
  })

  return (
    <button
      type="button"
      onClick={() => {
        if (action === 'activateTerminal') {
          focusTerminalBlock(nodeId, { type: 'instant' })
          return
        }
        if (action === 'activateThenLocateFromMinimap') {
          focusTerminalBlock(terminalToActivateId)
        }
        focusWorkbenchNode(nodeId)
      }}
    >
      聚焦远端终端
    </button>
  )
}

function createReactFlowInstance(
  nodeOrNodes: WorkbenchFlowNode | readonly WorkbenchFlowNode[],
  setViewport: SetViewportSpy,
  zoom = 1
): ReactFlowInstance<WorkbenchFlowNode, Edge> {
  const nodes = Array.isArray(nodeOrNodes) ? nodeOrNodes : [nodeOrNodes]
  let viewport = { x: 0, y: 0, zoom }

  return {
    getNode: (nodeId: string) => nodes.find((node) => node.id === nodeId),
    getViewport: () => viewport,
    getZoom: () => viewport.zoom,
    setViewport: (nextViewport: Viewport, options: { readonly duration: number }) => {
      viewport = nextViewport
      return setViewport(nextViewport, options)
    }
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
}

type SetViewportSpy = ReturnType<
  typeof vi.fn<(viewport: Viewport, options: { readonly duration: number }) => Promise<boolean>>
>

function stubReducedMotionPreference(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  )
}

function createTerminalNode(terminal: TerminalBlockSnapshot): WorkbenchFlowNode {
  return {
    id: terminal.id,
    data: { block: terminal },
    position: terminal.position,
    measured: terminal.size,
    type: 'terminal'
  } as WorkbenchFlowNode
}

function createAgentNode(): WorkbenchFlowNode {
  const agent: WorkspaceAgentSnapshot = {
    agentId: 'oversized-agent',
    cleancodeMcpEnabled: true,
    layout: {
      position: { x: 4_000, y: 3_000 },
      size: { width: 1_400, height: 1_000 }
    },
    name: 'Oversized Agent',
    projectId: 'project-1',
    providerId: 'codex',
    workspaceId: 'main'
  }

  return {
    id: 'agent:oversized-agent',
    data: { agent },
    measured: agent.layout.size,
    position: agent.layout.position,
    type: 'agentConsole'
  } as WorkbenchFlowNode
}

function createTerminalGroupNode(): WorkbenchFlowNode {
  const group: TerminalGroupSnapshot = {
    id: 'oversized-group',
    type: 'terminal-group',
    name: 'Oversized Group',
    position: { x: 4_000, y: 3_000 },
    size: { width: 1_400, height: 1_000 },
    isCollapsed: true,
    memberBlockIds: ['terminal-1', 'terminal-2']
  }

  return {
    id: group.id,
    data: { group },
    measured: group.size,
    position: group.position,
    type: 'terminalGroup'
  } as WorkbenchFlowNode
}

function createTerminalBlock(size = { width: 400, height: 300 }): TerminalBlockSnapshot {
  return {
    id: 'terminal-far-away',
    type: 'terminal',
    name: '远端终端',
    description: '',
    launchCommand: '',
    position: { x: 4_000, y: 3_000 },
    size,
    executionConfig: {
      mode: 'task',
      successExitCodes: [0],
      timeoutMs: null
    }
  }
}
