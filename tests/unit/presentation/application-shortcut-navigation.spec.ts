import {
  resolveAdjacentWorkspaceTarget,
  resolveDirectionalWorkbenchNode
} from '../../../src/presentation/app-shell/app-features/shortcuts/applicationShortcutNavigation'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('application shortcut navigation', () => {
  it.each([
    ['left', 'left'],
    ['right', 'right'],
    ['up', 'closer-diagonal'],
    ['down', 'down']
  ] as const)('selects the stable row or column target to the %s', (direction, expectedId) => {
    const nodes = [
      createNode('selected', 'terminal', 400, 300),
      createNode('left', 'terminalGroup', 100, 300),
      createNode('right', 'agentConsole', 700, 300),
      createNode('up', 'terminal', 400, 0),
      createNode('down', 'terminalGroup', 400, 600),
      createNode('closer-diagonal', 'agentConsole', 560, 130)
    ]

    expect(
      resolveDirectionalWorkbenchNode(
        nodes,
        'selected',
        { x: 0, y: 0, zoom: 1 },
        { width: 960, height: 640 },
        direction
      )?.id
    ).toBe(expectedId)
  })

  it.each([
    ['right', 'top-left', 'top-right'],
    ['left', 'top-right', 'top-left'],
    ['down', 'top-left', 'bottom-left'],
    ['up', 'bottom-left', 'top-left']
  ] as const)(
    'navigates %s between expanded group members without selecting the group frame',
    (direction, selectedNodeId, expectedId) => {
      const nodes = [
        createExpandedGroupNode(),
        createNode('top-left', 'terminal', 100, 100),
        createNode('top-right', 'terminal', 500, 100),
        createNode('bottom-left', 'terminal', 100, 400),
        createNode('bottom-right', 'terminal', 500, 400)
      ]

      expect(
        resolveDirectionalWorkbenchNode(
          nodes,
          selectedNodeId,
          { x: 0, y: 0, zoom: 1 },
          { width: 960, height: 640 },
          direction
        )?.id
      ).toBe(expectedId)
    }
  )

  it.each([
    ['down', 'adjacent-lower-row'],
    ['up', 'adjacent-upper-row']
  ] as const)(
    'chooses the adjacent %s row before a farther axis-aligned node',
    (direction, expectedId) => {
      const nodes = [
        createSizedNode('selected', 'terminal', 400, 300, 160, 100),
        createSizedNode('adjacent-upper-row', 'terminal', 0, 100, 120, 80),
        createSizedNode('farther-upper-aligned', 'terminal', 430, -120, 100, 80),
        createSizedNode('adjacent-lower-row', 'terminal', 0, 500, 120, 80),
        createSizedNode('farther-lower-aligned', 'terminal', 430, 720, 100, 80)
      ]

      expect(
        resolveDirectionalWorkbenchNode(
          nodes,
          'selected',
          { x: 0, y: 0, zoom: 1 },
          { width: 960, height: 640 },
          direction
        )?.id
      ).toBe(expectedId)
    }
  )

  it('selects an expanded group as a whole when navigating into it from outside', () => {
    const nodes = [
      createNode('outside', 'terminal', -400, 300),
      createExpandedGroupNode(),
      createNode('top-left', 'terminal', 100, 100),
      createNode('top-right', 'terminal', 500, 100),
      createNode('bottom-left', 'terminal', 100, 400),
      createNode('bottom-right', 'terminal', 500, 400)
    ]

    expect(
      resolveDirectionalWorkbenchNode(
        nodes,
        'outside',
        { x: 0, y: 0, zoom: 1 },
        { width: 960, height: 640 },
        'right'
      )?.id
    ).toBe('expanded-group')
  })

  it.each([
    ['down', 'top-left'],
    ['up', 'bottom-left'],
    ['right', 'top-left'],
    ['left', 'top-right']
  ] as const)('enters an expanded group through its %s-facing edge', (direction, expectedId) => {
    const nodes = [
      createExpandedGroupNode(),
      createNode('top-left', 'terminal', 100, 100),
      createNode('top-right', 'terminal', 500, 100),
      createNode('bottom-left', 'terminal', 100, 400),
      createNode('bottom-right', 'terminal', 500, 400)
    ]

    expect(
      resolveDirectionalWorkbenchNode(
        nodes,
        'expanded-group',
        { x: 0, y: 0, zoom: 1 },
        { width: 960, height: 640 },
        direction
      )?.id
    ).toBe(expectedId)
  })

  it.each([
    ['right', 'middle', 'right'],
    ['left', 'middle', 'left'],
    ['down', 'middle', 'lower-near'],
    ['up', 'middle', 'upper-near']
  ] as const)(
    'uses stable row and column navigation for %s across irregular node sizes',
    (direction, selectedNodeId, expectedId) => {
      const nodes = [
        createSizedNode('middle', 'terminal', 400, 300, 160, 100),
        createSizedNode('left', 'agentConsole', 80, 320, 240, 70),
        createSizedNode('right', 'terminal', 650, 280, 100, 160),
        createSizedNode('upper-far', 'terminal', 410, -200, 120, 80),
        createSizedNode('upper-near', 'terminal', 430, 120, 100, 80),
        createSizedNode('lower-far', 'terminal', 420, 760, 120, 80),
        createSizedNode('lower-near', 'terminal', 450, 500, 100, 80)
      ]

      expect(
        resolveDirectionalWorkbenchNode(
          nodes,
          selectedNodeId,
          { x: 0, y: 0, zoom: 1 },
          { width: 960, height: 640 },
          direction
        )?.id
      ).toBe(expectedId)
    }
  )

  it('selects the expanded parent group before leaving its member scope', () => {
    const nodes = [
      createExpandedGroupNode(),
      createNode('top-left', 'terminal', 100, 100),
      createNode('top-right', 'terminal', 500, 100),
      createNode('bottom-left', 'terminal', 100, 400),
      createNode('bottom-right', 'terminal', 500, 400),
      createNode('outside-right', 'terminal', 1_200, 100)
    ]

    expect(
      resolveDirectionalWorkbenchNode(
        nodes,
        'top-right',
        { x: 0, y: 0, zoom: 1 },
        { width: 960, height: 640 },
        'right'
      )?.id
    ).toBe('expanded-group')
  })

  it('leaves the expanded group after it was selected from a boundary member', () => {
    const nodes = [
      createExpandedGroupNode(),
      createNode('top-left', 'terminal', 100, 100),
      createNode('top-right', 'terminal', 500, 100),
      createNode('bottom-left', 'terminal', 100, 400),
      createNode('bottom-right', 'terminal', 500, 400),
      createNode('outside-right', 'terminal', 1_200, 100)
    ]

    expect(
      resolveDirectionalWorkbenchNode(
        nodes,
        'expanded-group',
        { x: 0, y: 0, zoom: 1 },
        { width: 960, height: 640 },
        'right',
        'top-right',
        'right'
      )?.id
    ).toBe('outside-right')
  })

  it('re-enters an expanded group when direction changes at the parent boundary', () => {
    const nodes = [
      createExpandedGroupNode(),
      createNode('top-left', 'terminal', 100, 100),
      createNode('top-right', 'terminal', 500, 100),
      createNode('bottom-left', 'terminal', 100, 400),
      createNode('bottom-right', 'terminal', 500, 400),
      createNode('outside-right', 'terminal', 1_200, 100)
    ]

    expect(
      resolveDirectionalWorkbenchNode(
        nodes,
        'expanded-group',
        { x: 0, y: 0, zoom: 1 },
        { width: 960, height: 640 },
        'down',
        'top-right',
        'right'
      )?.id
    ).toBe('top-left')
  })

  it('uses the viewport center when nothing is selected', () => {
    const nodes = [
      createNode('left', 'terminal', 100, 250),
      createNode('right', 'agentConsole', 600, 250)
    ]

    expect(
      resolveDirectionalWorkbenchNode(
        nodes,
        null,
        { x: -240, y: -160, zoom: 2 },
        { width: 960, height: 640 },
        'right'
      )?.id
    ).toBe('right')
  })

  it('does not wrap or return the current node when there is no directional candidate', () => {
    const nodes = [
      createNode('selected', 'terminal', 400, 300),
      createNode('left', 'terminal', 0, 300)
    ]

    expect(
      resolveDirectionalWorkbenchNode(
        nodes,
        'selected',
        { x: 0, y: 0, zoom: 1 },
        { width: 960, height: 640 },
        'right'
      )
    ).toBeNull()
  })

  it('skips a terminal surface parked by a collapsed group', () => {
    const selected = createNode('selected', 'terminal', 0, 0)
    const parked = {
      ...createNode('parked', 'terminal', 180, 0),
      data: { isParkedInCollapsedGroup: true }
    } as WorkbenchFlowNode
    const visible = createNode('visible', 'terminal', 360, 0)

    expect(
      resolveDirectionalWorkbenchNode(
        [selected, parked, visible],
        selected.id,
        { x: 0, y: 0, zoom: 1 },
        { width: 960, height: 640 },
        'right'
      )?.id
    ).toBe('visible')
  })

  it('cycles through every project workspace in sidebar order', () => {
    const alpha = createWorkbenchSnapshot('/tmp/alpha', 'alpha', {
      workspaces: [
        {
          workspaceId: 'main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: '/tmp/alpha',
          gitBranch: 'main',
          isCurrent: true
        },
        {
          workspaceId: 'feature/alpha',
          workspaceKind: 'linked-worktree',
          displayName: 'feature/alpha',
          directory: '/tmp/alpha-feature',
          gitBranch: 'feature/alpha',
          isCurrent: false
        }
      ]
    })
    const beta = createWorkbenchSnapshot('/tmp/beta', 'beta', {
      workspaces: [
        {
          workspaceId: 'main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: '/tmp/beta',
          gitBranch: 'main',
          isCurrent: true
        }
      ]
    })

    expect(resolveAdjacentWorkspaceTarget([alpha, beta], alpha, 'next')).toEqual({
      workbench: alpha,
      workspaceId: 'feature/alpha'
    })
    expect(resolveAdjacentWorkspaceTarget([alpha, beta], alpha, 'previous')).toEqual({
      workbench: beta,
      workspaceId: 'main'
    })

    const alphaFeature = {
      ...alpha,
      project: {
        ...alpha.project,
        workspaces: alpha.project.workspaces.map((workspace) => ({
          ...workspace,
          isCurrent: workspace.displayName === 'feature/alpha'
        }))
      }
    }
    expect(resolveAdjacentWorkspaceTarget([alpha, beta], alphaFeature, 'next')).toEqual({
      workbench: beta,
      workspaceId: 'main'
    })
  })

  it('does not invent a workspace target for an empty catalog', () => {
    expect(resolveAdjacentWorkspaceTarget([], null, 'next')).toBeNull()
  })
})

function createNode(
  id: string,
  type: WorkbenchFlowNode['type'],
  x: number,
  y: number
): WorkbenchFlowNode {
  return {
    id,
    type,
    position: { x, y },
    style: { width: 120, height: 80 },
    ...(type === 'terminalGroup' ? { data: { group: { isCollapsed: true } } } : {})
  } as unknown as WorkbenchFlowNode
}

function createSizedNode(
  id: string,
  type: WorkbenchFlowNode['type'],
  x: number,
  y: number,
  width: number,
  height: number
): WorkbenchFlowNode {
  return {
    ...createNode(id, type, x, y),
    style: { width, height }
  } as WorkbenchFlowNode
}

function createExpandedGroupNode(): WorkbenchFlowNode {
  return {
    id: 'expanded-group',
    type: 'terminalGroup',
    position: { x: 50, y: 50 },
    style: { width: 1_000, height: 800 },
    data: {
      group: {
        isCollapsed: false,
        memberBlockIds: ['top-left', 'top-right', 'bottom-left', 'bottom-right']
      }
    }
  } as unknown as WorkbenchFlowNode
}
