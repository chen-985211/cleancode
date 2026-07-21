import { render, waitFor } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useLayoutEffect, useRef, useState } from 'react'

import {
  useWorkbenchLayoutFocus,
  type WorkbenchLayoutFocusRequest
} from '../../../src/presentation/app-shell/useWorkbenchLayoutFocus'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'

describe('workbench layout focus', () => {
  it('waits for every focus node to reach the arranged geometry, then fits exactly once', async () => {
    const fitView = vi.fn(async () => undefined)
    const onHandled = vi.fn()
    const agentNode = createNode('agent:agent-1', { x: 40, y: 40 })
    const oldGroupNode = createGroupNode({ x: 80, y: 80 }, { width: 700, height: 420 })
    const projectedNodes = new Map<string, WorkbenchFlowNode>([
      [agentNode.id, agentNode],
      [oldGroupNode.id, oldGroupNode]
    ])
    const instance = createReactFlowInstance(projectedNodes, fitView)
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

    expect(fitView).not.toHaveBeenCalled()

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

    await waitFor(() => expect(fitView).toHaveBeenCalledOnce())
    expect(fitView).toHaveBeenCalledWith({
      duration: 220,
      nodes: [agentNode, groupNode],
      padding: 0.24
    })
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

    expect(fitView).toHaveBeenCalledOnce()
  })

  it('defers focus until every affected drag commit is no longer protected', async () => {
    const fitView = vi.fn(async () => undefined)
    const onHandled = vi.fn()
    const agentNode = createNode('agent:agent-1', { x: 40, y: 40 })
    const groupNode = createGroupNode({ x: 320, y: 720 }, { width: 900, height: 500 })
    const nodes = [agentNode, groupNode]
    const projectedNodes = new Map(nodes.map((node) => [node.id, node]))
    const instance = createReactFlowInstance(projectedNodes, fitView)
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

    expect(fitView).not.toHaveBeenCalled()

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

    await waitFor(() => expect(fitView).toHaveBeenCalledOnce())
    expect(fitView).toHaveBeenCalledWith({
      duration: 220,
      nodes: [agentNode, userPositionedGroupNode],
      padding: 0.24
    })
  })

  it('defers focus while the invoking Agent is being dragged', async () => {
    const fitView = vi.fn(async () => undefined)
    const onHandled = vi.fn()
    const agentNode = createNode('agent:agent-1', { x: 40, y: 40 })
    const groupNode = createGroupNode({ x: 320, y: 720 }, { width: 900, height: 500 })
    const nodes = [agentNode, groupNode]
    const instance = createReactFlowInstance(new Map(nodes.map((node) => [node.id, node])), fitView)
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

    expect(fitView).not.toHaveBeenCalled()

    rerender(
      <Harness
        instance={instance}
        nodes={nodes}
        onHandled={onHandled}
        protectedNodeIds={new Set()}
        request={request}
      />
    )

    await waitFor(() => expect(fitView).toHaveBeenCalledOnce())
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
    focusNodeIds: ['agent:agent-1', 'group-1'],
    operationId: 'tool-call-1'
  }
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
  fitView: ReturnType<typeof vi.fn>
): ReactFlowInstance<WorkbenchFlowNode, Edge> {
  return {
    fitView,
    getNode: (nodeId: string) => nodes.get(nodeId)
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
}
