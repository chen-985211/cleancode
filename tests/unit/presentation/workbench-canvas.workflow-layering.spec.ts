import type { Edge } from '@xyflow/react'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { CanvasArrangementSnapshot } from '../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { projectWorkbenchCanvasLayers } from '../../../src/presentation/app-shell/workbench/workbenchCanvasLayers'

const dependency = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  type: 'terminalDependency'
})
const node = (
  id: string,
  type: WorkbenchFlowNode['type'] = 'terminal',
  members: string[] = []
): WorkbenchFlowNode =>
  ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: type === 'terminalGroup' ? { group: { id, memberBlockIds: members } } : {}
  }) as WorkbenchFlowNode
const layers = (
  nodes: WorkbenchFlowNode[],
  edges: Edge[],
  draggedNodeIds: string[] = [],
  arrangement?: CanvasArrangementSnapshot
) => projectWorkbenchCanvasLayers({ nodes, edges, graph: null, draggedNodeIds, arrangement })
type Projection = ReturnType<typeof layers>
const ranks = (projection: Projection) =>
  Object.fromEntries(
    [...projection.nodes, ...projection.edges].map((item) => [item.id, item.zIndex!])
  )
function expectAbove(projection: Projection, upperIds: string[], lowerIds: string[]) {
  const values = ranks(projection)
  expect(Math.min(...upperIds.map((id) => values[id]!))).toBeGreaterThan(
    Math.max(...lowerIds.map((id) => values[id]!))
  )
}
function expectWorkflow(projection: Projection, ids: string[], edgeIds: string[]) {
  const values = ranks(projection)
  expect(new Set(ids.map((id) => values[id])).size).toBe(1)
  expect(new Set(edgeIds.map((id) => values[id])).size).toBe(1)
  expectAbove(projection, ids, edgeIds)
}

const flowNodes = [
  node('a'),
  node('d'),
  node('agent:one', 'agentConsole'),
  node('b'),
  node('e'),
  node('c')
]
const flowEdges = [dependency('a', 'b'), dependency('c', 'b'), dependency('d', 'e')]

describe('workbench canvas workflow layering', () => {
  it('retains a saved workflow order across selection and projection changes', () => {
    const raised = layers(flowNodes, flowEdges, ['b'])
    const retained = projectWorkbenchCanvasLayers({
      nodes: flowNodes.map((item) => ({ ...item, selected: true })),
      edges: flowEdges,
      graph: null,
      nodeOrder: raised.nodeOrder
    })
    expect(ranks(retained)).toEqual(ranks(raised))
    expectAbove(retained, ['a', 'b', 'c', 'a-b', 'c-b'], ['d', 'e', 'd-e', 'agent:one'])
  })

  it('preserves the committed internal order when moving a whole combination', () => {
    const nodes = [
      node('group', 'terminalGroup', ['a', 'b', 'c', 'd']),
      node('a'),
      node('c'),
      node('b'),
      node('d'),
      node('outside')
    ]
    const edges = [dependency('a', 'b'), dependency('c', 'd')]
    const member = layers(nodes, edges, ['a'])
    const covered = projectWorkbenchCanvasLayers({
      nodes,
      edges,
      graph: null,
      nodeOrder: member.nodeOrder,
      promotions: [['outside']]
    })
    const raised = projectWorkbenchCanvasLayers({
      nodes,
      edges,
      graph: null,
      nodeOrder: covered.nodeOrder,
      draggedNodeIds: ['group', 'a', 'b', 'c', 'd']
    })
    const retained = projectWorkbenchCanvasLayers({
      nodes,
      edges,
      graph: null,
      nodeOrder: raised.nodeOrder
    })
    expectAbove(retained, ['group', 'a', 'b', 'c', 'd', 'a-b', 'c-d'], ['outside'])
    expectAbove(retained, ['a', 'b', 'a-b'], ['c', 'd', 'c-d'])
    expect(ranks(retained)).toEqual(ranks(member))
  })

  it('keeps branching workflows indivisible even when the node order is interleaved', () => {
    const projection = layers(flowNodes, flowEdges)
    expectWorkflow(projection, ['a', 'b', 'c'], ['a-b', 'c-b'])
    expectWorkflow(projection, ['d', 'e'], ['d-e'])
    expectAbove(projection, ['d', 'e', 'd-e'], ['a', 'b', 'c', 'a-b', 'c-b'])
    expectAbove(projection, ['agent:one'], ['d', 'e', 'd-e'])
  })

  it.each(['a', 'b', 'c'])('raises the complete workflow when dragging member %s', (id) => {
    const before = layers(flowNodes, flowEdges)
    const during = layers(flowNodes, flowEdges, [id])
    expectWorkflow(during, ['a', 'b', 'c'], ['a-b', 'c-b'])
    expectAbove(during, ['a', 'b', 'c', 'a-b', 'c-b'], ['d', 'e', 'd-e', 'agent:one'])
    expect(ranks(layers(flowNodes, flowEdges))).toEqual(ranks(before))
    expect(during.nodes.map(({ position, selected }) => ({ position, selected }))).toEqual(
      flowNodes.map(({ position, selected }) => ({ position, selected }))
    )
  })

  it.each(['terminal', 'agentConsole', 'terminalGroup'] as const)(
    'raises a dragged %s above every workflow edge and node',
    (type) => {
      const nodes = [node('front', type), ...flowNodes]
      const before = layers(nodes, flowEdges)
      expectAbove(before, ['a', 'b', 'c', 'a-b', 'c-b'], ['front'])
      expectAbove(
        layers(nodes, flowEdges, ['front']),
        ['front'],
        [...flowNodes.map((item) => item.id), ...flowEdges.map((item) => item.id)]
      )
      expect(ranks(layers(nodes, flowEdges))).toEqual(ranks(before))
    }
  )

  it('keeps selection, context highlights, movement and edge selection out of base ordering', () => {
    const before = ranks(layers(flowNodes, flowEdges))
    const nodes = flowNodes.map((item, index) => ({
      ...item,
      selected: true,
      dragging: true,
      className: 'canvas-arrangement-node--selected',
      position: { x: index * -150, y: 600 }
    }))
    expect(
      ranks(
        layers(
          nodes,
          flowEdges.map((edge) => ({ ...edge, selected: true }))
        )
      )
    ).toEqual(before)
  })

  it.each(['group', 'a', 'b'])(
    'raises a combination and preserves internal workflow bands when dragging %s',
    (dragged) => {
      const nodes = [
        node('group', 'terminalGroup', ['a', 'b', 'c', 'd']),
        node('a'),
        node('c'),
        node('b'),
        node('d'),
        node('outside')
      ]
      const edges = [dependency('a', 'b'), dependency('c', 'd')]
      const before = layers(nodes, edges)
      expectAbove(before, ['a-b', 'c-d'], ['group'])
      expectAbove(before, ['c', 'd', 'c-d'], ['a', 'b', 'a-b'])
      const during = layers(nodes, edges, [dragged])
      expectAbove(during, ['group', 'a', 'b', 'c', 'd', 'a-b', 'c-d'], ['outside'])
      expectWorkflow(during, ['a', 'b'], ['a-b'])
      expectAbove(during, ['a-b', 'c-d'], ['group'])
      if (dragged === 'group') expectAbove(during, ['c', 'd', 'c-d'], ['a', 'b', 'a-b'])
      else expectAbove(during, ['a', 'b', 'a-b'], ['c', 'd', 'c-d'])
      expect(ranks(layers(nodes, edges))).toEqual(ranks(before))
    }
  )

  it('raises a collapsed combination whose retained members are hidden', () => {
    const group = node('group', 'terminalGroup', ['a', 'b'])
    const nodes = [group, node('outside')]
    expectAbove(layers(nodes, [], ['group']), ['group'], ['outside'])
    expectAbove(layers(nodes, []), ['outside'], ['group'])
  })

  it('respects mixed stack order and preserves it during whole-stack dragging', () => {
    const nodes = [
      node('agent:one', 'agentConsole'),
      node('group', 'terminalGroup', ['g']),
      node('a'),
      node('g'),
      node('b'),
      node('outside')
    ]
    const edges = [dependency('a', 'b')]
    const arrangement: CanvasArrangementSnapshot = {
      projectId: 'project',
      workspaceId: 'main',
      stacks: [
        {
          id: 'stack',
          anchor: { x: 0, y: 0 },
          items: [
            { kind: 'workflow', terminalIds: ['b', 'a'] },
            { kind: 'combination', terminalGroupId: 'group' },
            { kind: 'agent', agentId: 'one' }
          ]
        }
      ]
    }
    for (const dragged of [[], ['a', 'b', 'group', 'g', 'agent:one']]) {
      const projection = layers(nodes, edges, dragged, arrangement)
      expectAbove(projection, ['a', 'b', 'a-b'], ['outside'])
      expectAbove(projection, ['group', 'g'], ['a', 'b', 'a-b'])
      expectAbove(projection, ['agent:one'], ['group', 'g'])
    }
    expectAbove(
      layers(nodes, edges, ['outside'], arrangement),
      ['outside'],
      ['a', 'b', 'a-b', 'group', 'g', 'agent:one']
    )
    const covered = layers(nodes, edges, ['outside'], arrangement)
    for (const draggedNodeIds of [['a'], ['a', 'b', 'group', 'g', 'agent:one']]) {
      const raised = projectWorkbenchCanvasLayers({
        nodes,
        edges,
        graph: null,
        arrangement,
        nodeOrder: covered.nodeOrder,
        draggedNodeIds
      })
      const retained = projectWorkbenchCanvasLayers({
        nodes,
        edges,
        graph: null,
        arrangement,
        nodeOrder: raised.nodeOrder
      })
      expectAbove(retained, ['a', 'b', 'a-b'], ['outside'])
      expectAbove(retained, ['group', 'g'], ['a', 'b', 'a-b'])
      expectAbove(retained, ['agent:one'], ['group', 'g'])
    }
  })

  it('does not let a large stack overlap the layer range of the next stack', () => {
    const nodes = Array.from({ length: 25 }, (_, index) => node(`node-${index}`)).reverse()
    const arrangement: CanvasArrangementSnapshot = {
      projectId: 'project',
      workspaceId: 'main',
      stacks: [0, 1].map((index) => ({
        id: `stack-${index}`,
        anchor: { x: 0, y: 0 },
        items: Array.from({ length: 12 }, (_, item) => ({
          kind: 'terminal' as const,
          terminalId: `node-${index * 12 + item}`
        }))
      }))
    }
    const projection = layers(nodes, [], [], arrangement)
    for (let index = 1; index < 24; index++)
      expectAbove(projection, [`node-${index}`], [`node-${index - 1}`])
    expectAbove(projection, ['node-0'], ['node-24'])
  })

  it('uses the committed dependency graph and does not merge workflows through approval links', () => {
    const graph = {
      id: 'graph',
      projectId: 'project',
      workspaceId: 'main',
      viewport: { x: 0, y: 0, zoom: 1 },
      blocks: [],
      terminalGroups: [],
      connections: [{ id: 'a-b', sourceBlockId: 'a', targetBlockId: 'b' }]
    } satisfies BlockGraphSnapshot
    const nodes = [node('a'), node('agent:one', 'agentConsole'), node('b'), node('c')]
    const edges = [
      dependency('a', 'b'),
      { id: 'approval', source: 'agent:one', target: 'a', type: 'approvalIntent' },
      dependency('b', 'c')
    ]
    const projection = projectWorkbenchCanvasLayers({ nodes, edges, graph, draggedNodeIds: ['b'] })
    expectWorkflow(projection, ['a', 'b'], ['a-b'])
    expectAbove(projection, ['a-b'], ['agent:one', 'c', 'approval', 'b-c'])
    const split = projectWorkbenchCanvasLayers({
      nodes,
      edges: [],
      graph: { ...graph, connections: [] }
    })
    expectAbove(split, ['b'], ['a'])
  })
})
