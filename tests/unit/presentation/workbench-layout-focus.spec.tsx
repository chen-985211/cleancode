import { render, waitFor } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useLayoutEffect, useRef, useState } from 'react'

import {
  useWorkbenchLayoutFocus,
  type WorkbenchLayoutFocusRequest
} from '../../../src/presentation/app-shell/useWorkbenchLayoutFocus'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'

describe('workbench layout focus', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('waits for every focus node to reach the arranged geometry, then fits exactly once', async () => {
    const getNodesBounds = vi.fn(() => ({ height: 1_180, width: 1_180, x: 40, y: 40 }))
    const setViewport = vi.fn(async () => true)
    const onHandled = vi.fn()
    const agentNode = createNode('agent:agent-1', { x: 40, y: 40 })
    const oldGroupNode = createGroupNode({ x: 80, y: 80 }, { width: 700, height: 420 })
    const projectedNodes = new Map<string, WorkbenchFlowNode>([
      [agentNode.id, agentNode],
      [oldGroupNode.id, oldGroupNode]
    ])
    const instance = createReactFlowInstance(projectedNodes, getNodesBounds, setViewport)
    const request = createRequest()
    const { rerender } = render(
      <Harness
        instance={instance}
        nodes={[agentNode, oldGroupNode]}
        onHandled={onHandled}
        protectedNodeIds={new Set()}
        request={request}
      />
    )

    expect(setViewport).not.toHaveBeenCalled()

    const groupNode = createGroupNode({ x: 320, y: 720 }, { width: 900, height: 500 })
    projectedNodes.set(groupNode.id, groupNode)

    rerender(
      <Harness
        instance={instance}
        nodes={[agentNode, groupNode]}
        onHandled={onHandled}
        protectedNodeIds={new Set()}
        request={request}
      />
    )

    await waitFor(() => expect(setViewport).toHaveBeenCalledOnce())
    expect(getNodesBounds).toHaveBeenCalledWith([agentNode, groupNode])
    expect(setViewport).toHaveBeenCalledWith(expect.any(Object), { duration: 0 })
    expect(onHandled).toHaveBeenCalledWith('tool-call-1')

    rerender(
      <Harness
        instance={instance}
        nodes={[agentNode, groupNode]}
        onHandled={onHandled}
        protectedNodeIds={new Set()}
        request={request}
      />
    )

    expect(setViewport).toHaveBeenCalledOnce()
  })

  it('defers focus until every affected drag commit is no longer protected', async () => {
    const getNodesBounds = vi.fn(() => ({ height: 1_360, width: 1_380, x: 40, y: 40 }))
    const setViewport = vi.fn(async () => true)
    const onHandled = vi.fn()
    const agentNode = createNode('agent:agent-1', { x: 40, y: 40 })
    const groupNode = createGroupNode({ x: 320, y: 720 }, { width: 900, height: 500 })
    const nodes = [agentNode, groupNode]
    const projectedNodes = new Map(nodes.map((node) => [node.id, node]))
    const instance = createReactFlowInstance(projectedNodes, getNodesBounds, setViewport)
    const request = createRequest()
    const { rerender } = render(
      <Harness
        instance={instance}
        nodes={nodes}
        onHandled={onHandled}
        protectedNodeIds={new Set(['terminal-1'])}
        request={request}
      />
    )

    expect(setViewport).not.toHaveBeenCalled()

    const userPositionedGroupNode = createGroupNode({ x: 520, y: 900 }, { width: 900, height: 500 })
    projectedNodes.set(userPositionedGroupNode.id, userPositionedGroupNode)

    rerender(
      <Harness
        instance={instance}
        nodes={[agentNode, userPositionedGroupNode]}
        onHandled={onHandled}
        protectedNodeIds={new Set()}
        request={request}
      />
    )

    await waitFor(() => expect(setViewport).toHaveBeenCalledOnce())
    expect(getNodesBounds).toHaveBeenCalledWith([agentNode, userPositionedGroupNode])
  })

  it('defers focus while the invoking Agent is being dragged', async () => {
    const getNodesBounds = vi.fn(() => ({ height: 1_180, width: 1_180, x: 40, y: 40 }))
    const setViewport = vi.fn(async () => true)
    const onHandled = vi.fn()
    const agentNode = createNode('agent:agent-1', { x: 40, y: 40 })
    const groupNode = createGroupNode({ x: 320, y: 720 }, { width: 900, height: 500 })
    const nodes = [agentNode, groupNode]
    const instance = createReactFlowInstance(
      new Map(nodes.map((node) => [node.id, node])),
      getNodesBounds,
      setViewport
    )
    const request = createRequest()
    const { rerender } = render(
      <Harness
        instance={instance}
        nodes={nodes}
        onHandled={onHandled}
        protectedNodeIds={new Set(['agent:agent-1'])}
        request={request}
      />
    )

    expect(setViewport).not.toHaveBeenCalled()

    rerender(
      <Harness
        instance={instance}
        nodes={nodes}
        onHandled={onHandled}
        protectedNodeIds={new Set()}
        request={request}
      />
    )

    await waitFor(() => expect(setViewport).toHaveBeenCalledOnce())
  })

  it('frames committed workflow bounds while terminals are still at entering positions', async () => {
    const getNodesBounds = vi.fn(() => ({ height: 0, width: 0, x: 0, y: 0 }))
    let resolveViewport: (applied: boolean) => void = () => undefined
    const setViewport = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveViewport = resolve
        })
    )
    const onHandled = vi.fn()
    const agentNode = createSizedAgentNode()
    const enteringTerminalNode = createTerminalNode({ x: 380, y: 340 })
    const nodes = [agentNode, enteringTerminalNode]
    const instance = createReactFlowInstance(
      new Map(nodes.map((node) => [node.id, node])),
      getNodesBounds,
      setViewport
    )
    const request: WorkbenchLayoutFocusRequest = {
      affectedNodeIds: ['terminal-1'],
      expectedNodeLayouts: [
        {
          nodeId: 'terminal-1',
          position: { x: 1_000, y: 800 },
          size: { width: 420, height: 306 }
        }
      ],
      focusNodeIds: ['agent:agent-1', 'terminal-1'],
      focusTarget: 'committed-layouts',
      operationId: 'workflow-call-1'
    }

    render(
      <Harness
        instance={instance}
        nodes={nodes}
        onHandled={onHandled}
        protectedNodeIds={new Set()}
        request={request}
      />
    )

    await waitFor(() => expect(setViewport).toHaveBeenCalledOnce())
    expect(onHandled).not.toHaveBeenCalled()

    resolveViewport(true)

    await waitFor(() => expect(onHandled).toHaveBeenCalledWith('workflow-call-1'))
    expect(setViewport).toHaveBeenCalledWith(expect.any(Object), { duration: 0 })
    expect(getNodesBounds).not.toHaveBeenCalled()
  })

  it('does not magnify a workflow focus beyond readable canvas scale', async () => {
    const canvas = document.createElement('div')
    canvas.className = 'react-flow'
    Object.defineProperties(canvas, {
      clientHeight: { configurable: true, value: 1_200 },
      clientWidth: { configurable: true, value: 1_920 }
    })
    document.body.append(canvas)

    const agentNode = createSizedAgentNode()
    const terminalNode = createTerminalNode({ x: 380, y: 120 })
    const nodes = [agentNode, terminalNode]
    const setViewport = vi.fn(async () => true)
    const instance = createReactFlowInstance(
      new Map(nodes.map((node) => [node.id, node])),
      vi.fn(() => ({ height: 0, width: 0, x: 0, y: 0 })),
      setViewport
    )
    const request: WorkbenchLayoutFocusRequest = {
      affectedNodeIds: ['terminal-1'],
      expectedNodeLayouts: [
        {
          nodeId: 'terminal-1',
          position: { x: 520, y: 40 },
          size: { width: 420, height: 306 }
        }
      ],
      focusNodeIds: ['agent:agent-1', 'terminal-1'],
      focusTarget: 'committed-layouts',
      operationId: 'workflow-call-readable-zoom'
    }

    render(
      <Harness
        instance={instance}
        nodes={nodes}
        onHandled={vi.fn()}
        protectedNodeIds={new Set()}
        request={request}
      />
    )

    await waitFor(() => expect(setViewport).toHaveBeenCalledOnce())
    expect(setViewport).toHaveBeenCalledWith(expect.objectContaining({ zoom: 1 }), {
      duration: 0
    })

    canvas.remove()
  })
})

function Harness({
  instance,
  nodes,
  onHandled,
  protectedNodeIds,
  request
}: {
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly nodes: readonly WorkbenchFlowNode[]
  readonly onHandled: (operationId: string) => void
  readonly protectedNodeIds: ReadonlySet<string>
  readonly request: WorkbenchLayoutFocusRequest | null
}) {
  const instanceRef = useRef(instance)
  const [nodeStore] = useState(() => createWorkbenchNodeStore([...nodes]))

  useLayoutEffect(() => {
    nodeStore.setNodes([...nodes])
  }, [nodeStore, nodes])

  useWorkbenchLayoutFocus({
    nodeStore,
    onHandled,
    protectedNodeIds,
    reactFlowInstanceRef: instanceRef,
    request
  })

  return null
}

function createRequest(): WorkbenchLayoutFocusRequest {
  return {
    affectedNodeIds: ['terminal-1', 'group-1'],
    expectedNodeLayouts: [
      {
        nodeId: 'group-1',
        position: { x: 320, y: 720 },
        size: { width: 900, height: 500 }
      }
    ],
    focusTarget: 'projected-nodes',
    focusNodeIds: ['agent:agent-1', 'group-1'],
    operationId: 'tool-call-1'
  }
}

function createSizedAgentNode(): WorkbenchFlowNode {
  return {
    id: 'agent:agent-1',
    position: { x: 40, y: 40 },
    style: { width: 440, height: 520 },
    type: 'agentConsole',
    data: {
      agent: {
        layout: { position: { x: 40, y: 40 }, size: { width: 440, height: 520 } }
      }
    }
  } as WorkbenchFlowNode
}

function createTerminalNode(position: {
  readonly x: number
  readonly y: number
}): WorkbenchFlowNode {
  return {
    id: 'terminal-1',
    position,
    style: { width: 420, height: 306 },
    type: 'terminal',
    data: {
      block: { id: 'terminal-1', position, size: { width: 420, height: 306 } }
    }
  } as WorkbenchFlowNode
}

function createNode(
  id: string,
  position: { readonly x: number; readonly y: number }
): WorkbenchFlowNode {
  return { id, position } as WorkbenchFlowNode
}

function createGroupNode(
  position: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number }
): WorkbenchFlowNode {
  return {
    id: 'group-1',
    position,
    type: 'terminalGroup',
    data: {
      group: { id: 'group-1', position, size }
    }
  } as WorkbenchFlowNode
}

function createReactFlowInstance(
  nodes: ReadonlyMap<string, WorkbenchFlowNode>,
  getNodesBounds: ReturnType<typeof vi.fn>,
  setViewport: ReturnType<typeof vi.fn>
): ReactFlowInstance<WorkbenchFlowNode, Edge> {
  return {
    getNode: (nodeId: string) => nodes.get(nodeId),
    getNodesBounds,
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
}

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
