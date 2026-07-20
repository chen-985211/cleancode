import {
  resolveAdjacentWorkspaceTarget,
  resolveContinuousCanvasPanViewport
} from '../../../src/presentation/app-shell/applicationShortcutNavigation'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('application shortcut navigation', () => {
  it('moves at the same speed for different frame intervals without changing zoom', () => {
    const viewport = { x: 12, y: -8, zoom: 1.5 }

    const oneFrame = resolveContinuousCanvasPanViewport(viewport, ['left'], 600, 16)
    const twoFrames = resolveContinuousCanvasPanViewport(
      resolveContinuousCanvasPanViewport(viewport, ['left'], 600, 8),
      ['left'],
      600,
      8
    )

    expect(oneFrame).toEqual({ x: 21.6, y: -8, zoom: 1.5 })
    expect(twoFrames).toEqual(oneFrame)
  })

  it('normalizes diagonal movement and cancels opposite directions', () => {
    const diagonal = resolveContinuousCanvasPanViewport(
      { x: 0, y: 0, zoom: 1 },
      ['left', 'up'],
      600,
      100
    )

    expect(diagonal.x).toBeCloseTo(60 / Math.sqrt(2))
    expect(diagonal.y).toBeCloseTo(60 / Math.sqrt(2))
    expect(
      resolveContinuousCanvasPanViewport({ x: 0, y: 0, zoom: 1 }, ['left', 'right', 'up'], 600, 100)
    ).toEqual({ x: 0, y: 60, zoom: 1 })
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
