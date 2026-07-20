import {
  resolveAdjacentWorkspaceTarget,
  resolvePannedCanvasViewport
} from '../../../src/presentation/app-shell/applicationShortcutNavigation'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('application shortcut navigation', () => {
  it.each([
    ['left', { x: 160, y: 0, zoom: 1.5 }],
    ['right', { x: -160, y: 0, zoom: 1.5 }],
    ['up', { x: 0, y: 160, zoom: 1.5 }],
    ['down', { x: 0, y: -160, zoom: 1.5 }]
  ] as const)(
    'pans the canvas %s in screen coordinates without changing zoom',
    (direction, expected) => {
      expect(resolvePannedCanvasViewport({ x: 0, y: 0, zoom: 1.5 }, direction, 160)).toEqual(
        expected
      )
    }
  )

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
