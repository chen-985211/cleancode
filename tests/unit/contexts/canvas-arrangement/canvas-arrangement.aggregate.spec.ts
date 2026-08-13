import { CanvasArrangement } from '../../../../src/contexts/canvas-arrangement/domain/aggregates/CanvasArrangement'
import type { CanvasArrangementItemReference } from '../../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'

describe('canvas arrangement aggregate', () => {
  it('persists a mixed stack without changing the semantic identity of its members', () => {
    const arrangement = CanvasArrangement.create({
      projectId: 'project-1',
      workspaceId: 'main'
    })

    const stack = arrangement.createStack({
      id: 'stack-1',
      anchor: { x: 120, y: 80 },
      items: [
        terminal('terminal-1'),
        workflow('terminal-2', 'terminal-3'),
        combination('group-1'),
        agent('agent-1')
      ]
    })

    expect(stack.items).toEqual([
      terminal('terminal-1'),
      workflow('terminal-2', 'terminal-3'),
      combination('group-1'),
      agent('agent-1')
    ])
    expect(arrangement.toSnapshot()).toEqual({
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [stack]
    })
  })

  it('removes the stack relation without changing its members', () => {
    const arrangement = CanvasArrangement.fromSnapshot({
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          id: 'stack-1',
          anchor: { x: 120, y: 80 },
          items: [terminal('terminal-1'), agent('agent-1')]
        }
      ]
    })

    const removed = arrangement.removeStack('stack-1')

    expect(removed.items).toEqual([terminal('terminal-1'), agent('agent-1')])
    expect(arrangement.toSnapshot().stacks).toHaveLength(0)
  })

  it('moves a stack anchor without changing its ordered members', () => {
    const arrangement = CanvasArrangement.fromSnapshot({
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          id: 'stack-1',
          anchor: { x: 120, y: 80 },
          items: [terminal('terminal-1'), agent('agent-1')]
        }
      ]
    })

    const moved = arrangement.moveStack('stack-1', { x: 420, y: 280 })

    expect(moved).toEqual({
      id: 'stack-1',
      anchor: { x: 420, y: 280 },
      items: [terminal('terminal-1'), agent('agent-1')]
    })
  })

  it('merges complete existing stacks into a newly selected stack', () => {
    const arrangement = CanvasArrangement.fromSnapshot({
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          id: 'stack-1',
          anchor: { x: 120, y: 80 },
          items: [terminal('terminal-1'), agent('agent-1')]
        }
      ]
    })

    arrangement.createMergedStack({
      id: 'stack-2',
      anchor: { x: 300, y: 200 },
      items: [terminal('terminal-1'), agent('agent-1'), combination('group-1')]
    })

    expect(arrangement.toSnapshot().stacks).toEqual([
      {
        id: 'stack-2',
        anchor: { x: 300, y: 200 },
        items: [terminal('terminal-1'), agent('agent-1'), combination('group-1')]
      }
    ])
  })

  it('does not fracture an existing stack during merge', () => {
    const arrangement = CanvasArrangement.fromSnapshot({
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          id: 'stack-1',
          anchor: { x: 120, y: 80 },
          items: [terminal('terminal-1'), agent('agent-1')]
        }
      ]
    })

    expect(() =>
      arrangement.createMergedStack({
        id: 'stack-2',
        anchor: { x: 300, y: 200 },
        items: [terminal('terminal-1'), combination('group-1')]
      })
    ).toThrow('Canvas stack merge must include every member of an existing stack.')
  })

  it('rejects duplicate members, overlapping stacks, invalid workflow references, and invalid geometry', () => {
    const arrangement = CanvasArrangement.create({
      projectId: 'project-1',
      workspaceId: 'main'
    })
    arrangement.createStack({
      id: 'stack-1',
      anchor: { x: 120, y: 80 },
      items: [terminal('terminal-1'), agent('agent-1')]
    })

    expect(() =>
      arrangement.createStack({
        id: 'stack-2',
        anchor: { x: 300, y: 300 },
        items: [agent('agent-1'), combination('group-1')]
      })
    ).toThrow('Canvas object already belongs to another stack.')
    expect(() =>
      arrangement.createStack({
        id: 'stack-2',
        anchor: { x: 300, y: 300 },
        items: [terminal('terminal-2'), terminal('terminal-2')]
      })
    ).toThrow('Canvas stack members must be unique.')
    expect(() =>
      arrangement.createStack({
        id: 'stack-2',
        anchor: { x: 300, y: 300 },
        items: [workflow('terminal-3'), combination('group-1')]
      })
    ).toThrow('Canvas workflow reference requires at least two terminal IDs.')
    expect(() =>
      arrangement.createStack({
        id: 'stack-2',
        anchor: { x: Number.NaN, y: 300 },
        items: [terminal('terminal-3'), combination('group-1')]
      })
    ).toThrow('Canvas stack anchor must use finite coordinates.')
  })

  it('prunes missing objects and dissolves stacks with fewer than two valid members', () => {
    const arrangement = CanvasArrangement.fromSnapshot({
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          id: 'stack-1',
          anchor: { x: 120, y: 80 },
          items: [terminal('terminal-1'), agent('agent-1'), combination('group-1')]
        },
        {
          id: 'stack-2',
          anchor: { x: 400, y: 80 },
          items: [terminal('terminal-2'), agent('agent-2')]
        }
      ]
    })

    const result = arrangement.reconcile([
      CanvasArrangement.itemKey(terminal('terminal-1')),
      CanvasArrangement.itemKey(agent('agent-1')),
      CanvasArrangement.itemKey(agent('agent-2'))
    ])

    expect(result).toEqual({ changed: true, removedStackIds: ['stack-2'] })
    expect(arrangement.toSnapshot().stacks).toEqual([
      {
        id: 'stack-1',
        anchor: { x: 120, y: 80 },
        items: [terminal('terminal-1'), agent('agent-1')]
      }
    ])
  })
})

function terminal(terminalId: string): CanvasArrangementItemReference {
  return { kind: 'terminal', terminalId }
}

function workflow(...terminalIds: string[]): CanvasArrangementItemReference {
  return { kind: 'workflow', terminalIds }
}

function combination(terminalGroupId: string): CanvasArrangementItemReference {
  return { kind: 'combination', terminalGroupId }
}

function agent(agentId: string): CanvasArrangementItemReference {
  return { kind: 'agent', agentId }
}
