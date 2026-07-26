import { createRunLifecycleAdapters } from '../../../src/platform/electron-main/runLifecycleAdapters'

describe('Run lifecycle platform adapters', () => {
  it('maps Project workspace and project disposal to the Run lifecycle service', async () => {
    const workspaceLease = createLease()
    const workspacesLease = createLease()
    const projectLease = createLease()
    const service = {
      hardDisposeWorkspace: vi.fn(async () => workspaceLease),
      hardDisposeWorkspaces: vi.fn(async () => workspacesLease),
      hardDisposeProject: vi.fn(async () => projectLease),
      hardDisposeTerminal: vi.fn(),
      isWorkspaceQuarantined: vi.fn(() => true),
      resolveProjectQuarantines: vi.fn()
    }
    const { workspaceRuns } = createRunLifecycleAdapters(service)

    await expect(
      workspaceRuns.disposeWorkspace({
        projectDirectory: '/work/app',
        workspaceId: 'feature/sidebar'
      })
    ).resolves.toBe(workspaceLease)
    await expect(
      workspaceRuns.disposeWorkspaces({
        projectDirectory: '/work/app',
        workspaceIds: ['main', 'feature/sidebar']
      })
    ).resolves.toBe(workspacesLease)
    await expect(workspaceRuns.disposeProject('/work/app')).resolves.toBe(projectLease)
    expect(workspaceRuns.isWorkspaceQuarantined).toBeDefined()
    expect(
      workspaceRuns.isWorkspaceQuarantined({
        projectDirectory: '/work/app',
        workspaceId: 'feature/sidebar'
      })
    ).toBe(true)
    workspaceRuns.resolveProjectQuarantines('/work/app')

    expect(service.hardDisposeWorkspace).toHaveBeenCalledWith({
      projectDirectory: '/work/app',
      workspaceId: 'feature/sidebar'
    })
    expect(service.hardDisposeWorkspaces).toHaveBeenCalledWith({
      projectDirectory: '/work/app',
      workspaceIds: ['main', 'feature/sidebar']
    })
    expect(service.hardDisposeProject).toHaveBeenCalledWith('/work/app')
    expect(service.resolveProjectQuarantines).toHaveBeenCalledWith('/work/app')
  })

  it('hard-disposes a terminal while acquiring the BlockGraph deletion lease', async () => {
    const runLease = createLease()
    const service = {
      hardDisposeWorkspace: vi.fn(),
      hardDisposeWorkspaces: vi.fn(),
      hardDisposeProject: vi.fn(),
      hardDisposeTerminal: vi.fn(async () => runLease),
      isWorkspaceQuarantined: vi.fn(() => false),
      resolveProjectQuarantines: vi.fn()
    }
    const { terminalRuns } = createRunLifecycleAdapters(service)

    const lease = await terminalRuns.acquireTerminalDeletion({
      projectId: 'project-1',
      projectDirectory: '/work/app',
      workspaceId: 'main',
      blockId: 'terminal-1'
    })
    await lease.hardDispose()
    lease.release()
    lease.resolve()
    lease.quarantine()

    expect(service.hardDisposeTerminal).toHaveBeenCalledTimes(1)
    expect(service.hardDisposeTerminal).toHaveBeenCalledWith({
      projectId: 'project-1',
      projectDirectory: '/work/app',
      workspaceId: 'main',
      blockId: 'terminal-1'
    })
    expect(runLease.release).toHaveBeenCalledTimes(1)
    expect(runLease.resolve).toHaveBeenCalledTimes(1)
    expect(runLease.quarantine).toHaveBeenCalledTimes(1)
  })
})

function createLease() {
  return {
    wasQuarantined: false,
    quarantine: vi.fn(),
    release: vi.fn(),
    resolve: vi.fn()
  }
}
