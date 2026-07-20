import { resolveProjectReorderTarget } from '../../../src/presentation/app-shell/useProjectSidebarReorder'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('project sidebar reorder target', () => {
  const workbenches = [
    createWorkbenchSnapshot('/tmp/alpha', 'alpha'),
    createWorkbenchSnapshot('/tmp/beta', 'beta'),
    createWorkbenchSnapshot('/tmp/gamma', 'gamma')
  ]

  it('maps a drop after the last card to the persisted end position', () => {
    expect(resolveProjectReorderTarget(workbenches, '/tmp/alpha', 3)).toBeNull()
  })

  it('ignores both visual slots that preserve the source position', () => {
    expect(resolveProjectReorderTarget(workbenches, '/tmp/beta', 1)).toBeUndefined()
    expect(resolveProjectReorderTarget(workbenches, '/tmp/beta', 2)).toBeUndefined()
  })
})
