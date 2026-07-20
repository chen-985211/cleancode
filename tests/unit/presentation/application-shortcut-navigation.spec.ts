import {
  resolveAdjacentWorkspaceTarget,
  resolveDirectionalWorkbenchNode
} from '../../../src/presentation/app-shell/applicationShortcutNavigation'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('application shortcut navigation', () => {
  it.each([
    ['left', 'left'],
    ['right', 'right'],
    ['up', 'up'],
    ['down', 'down']
  ] as const)('selects the closest aligned node to the %s', (direction, expectedId) => {
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

  it('cycles through every project workspace in sidebar order', () => {
    const alpha = createWorkbenchSnapshot('/tmp/alpha', 'alpha', {
      workspaces: [
        {
          name: 'main',
          directory: '/tmp/alpha',
          gitBranch: 'main',
          isCurrent: true
        },
        {
          name: 'feature/alpha',
          directory: '/tmp/alpha-feature',
          gitBranch: 'feature/alpha',
          isCurrent: false
        }
      ]
    })
    const beta = createWorkbenchSnapshot('/tmp/beta', 'beta', {
      workspaces: [
        {
          name: 'main',
          directory: '/tmp/beta',
          gitBranch: 'main',
          isCurrent: true
        }
      ]
    })

    expect(resolveAdjacentWorkspaceTarget([alpha, beta], alpha, 'next')).toEqual({
      workbench: alpha,
      workspaceName: 'feature/alpha'
    })
    expect(resolveAdjacentWorkspaceTarget([alpha, beta], alpha, 'previous')).toEqual({
      workbench: beta,
      workspaceName: 'main'
    })

    const alphaFeature = {
      ...alpha,
      project: {
        ...alpha.project,
        workspaces: alpha.project.workspaces.map((workspace) => ({
          ...workspace,
          isCurrent: workspace.name === 'feature/alpha'
        }))
      }
    }
    expect(resolveAdjacentWorkspaceTarget([alpha, beta], alphaFeature, 'next')).toEqual({
      workbench: beta,
      workspaceName: 'main'
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
    style: { width: 120, height: 80 }
  } as WorkbenchFlowNode
}
