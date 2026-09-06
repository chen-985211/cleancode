import { PrepareWorkspaceInitializationUseCase } from '../../../../src/contexts/project/application/use-cases/PrepareWorkspaceInitializationUseCase'
import { CreateBranchWorkspaceUseCase } from '../../../../src/contexts/project/application/use-cases/CreateBranchWorkspaceUseCase'
import { ProjectWorkspaceTransactionCoordinator } from '../../../../src/contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import { Project } from '../../../../src/contexts/project/domain/aggregates/Project'
import type {
  WorkspaceDefaults,
  WorkspaceInitializationSnapshot
} from '../../../../src/contexts/project/application/dto/WorkspaceInitializationDetails'
import type { WorkspaceInitializationRepository } from '../../../../src/contexts/project/application/ports/WorkspaceInitializationRepository'
import type {
  GitRepositoryInspection,
  GitWorkspacePort
} from '../../../../src/contexts/project/application/ports/GitWorkspacePort'

const defaults: WorkspaceDefaults = {
  templates: [{ templateId: 'dev', runAfterPlacement: false }],
  agents: [{ providerId: 'provider', count: 1 }]
}

describe('prepare workspace initialization', () => {
  it('recovers into an empty workspace already discovered by Git synchronization after a metadata failure', async () => {
    const f = fixture()
    f.projects.save.mockRejectedValueOnce(new Error('Disk unavailable'))
    const command = { projectDirectory: '/project', branchName: 'feature', requestId: 'synced' }
    await expect(f.prepare.create(command)).rejects.toThrow()
    await f.projects.save(
      Project.fromSnapshot(f.project()).addLinkedWorktreeWorkspace({
        workspaceId: 'discovered',
        displayName: 'feature',
        gitBranch: 'feature',
        directory: '/worktrees/feature'
      })
    )
    await f.prepare.create(command)
    expect(f.records.get('synced')).toMatchObject({ workspaceId: 'discovered', stage: 'ready' })
    expect(f.git.createBranchWorktree).toHaveBeenCalledOnce()
  })
  it('freezes contents for a new worktree once and never creates canvas content during reads or preparation', async () => {
    const f = fixture()
    await f.prepare.getDefaults('/project')
    expect(f.content.prepareTemplate).not.toHaveBeenCalled()
    const command = { projectDirectory: '/project', branchName: 'feature', requestId: 'request' }
    const [first, second] = await Promise.all([
      f.prepare.create(command),
      f.prepare.create(command)
    ])
    expect(first).toEqual(second)
    expect(f.git.createBranchWorktree).toHaveBeenCalledOnce()
    expect(f.content.prepareTemplate).toHaveBeenCalledOnce()
    expect(f.content.createTemplate).not.toHaveBeenCalled()
    expect(f.content.createAgent).not.toHaveBeenCalled()
    expect(f.records.get('request')).toMatchObject({
      stage: 'ready',
      worktreeCreated: true,
      workspaceId: first.workspaces.find((item) => item.isCurrent)?.workspaceId
    })
    await f.prepare.saveDefaults('/project', { templates: [], agents: [] })
    expect(f.records.get('request')?.items).toHaveLength(2)
  })

  it('uses the latest empty defaults snapshot while persisted project settings are still outdated', async () => {
    const f = fixture()
    await f.prepare.create({
      projectDirectory: '/project',
      branchName: 'feature',
      requestId: 'blank',
      defaults: { templates: [], agents: [] }
    })
    expect(f.records.get('blank')?.stage).toBe('complete')
    expect(await f.prepare.getDefaults('/project')).toEqual(defaults)
    expect(f.content.prepareTemplate).not.toHaveBeenCalled()
  })

  it('retains template preparation failures while successfully creating the worktree', async () => {
    const f = fixture()
    f.content.prepareTemplate.mockRejectedValueOnce(new Error('Missing template'))
    const created = await f.prepare.create({
      projectDirectory: '/project',
      branchName: 'feature',
      requestId: 'partial'
    })
    expect(created.workspaces).toHaveLength(2)
    expect(f.records.get('partial')?.items.map((item) => item.status)).toEqual([
      'failed',
      'pending'
    ])
  })

  it('recovers the exact worktree identity after Git succeeds but project metadata cannot be saved', async () => {
    const f = fixture()
    f.projects.save.mockRejectedValueOnce(new Error('Disk unavailable'))
    const command = {
      projectDirectory: '/project',
      branchName: 'feature',
      requestId: 'interrupted'
    }
    await expect(f.prepare.create(command)).rejects.toThrow('Disk unavailable')
    const reserved = f.records.get('interrupted')!
    const recovered = await f.prepare.create(command)
    expect(recovered.workspaces.find((item) => item.isCurrent)?.workspaceId).toBe(
      reserved.workspaceId
    )
    expect(f.git.createBranchWorktree).toHaveBeenCalledOnce()
  })

  it('does not adopt an externally created matching branch without a Git creation receipt', async () => {
    const f = fixture()
    f.git.createBranchWorktree.mockImplementationOnce(async (command) => {
      f.addGitWorktree(command.branchName, command.worktreeDirectory)
      throw new Error('Response lost before a creation receipt')
    })
    const command = { projectDirectory: '/project', branchName: 'feature', requestId: 'uncertain' }
    await expect(f.prepare.create(command)).rejects.toThrow()
    await expect(f.prepare.create(command)).rejects.toMatchObject({
      code: 'WORKSPACE_INITIALIZATION_CONFLICT'
    })
    expect(f.project().workspaces).toHaveLength(1)
  })

  it('admits only one unfinished empty-canvas operation across simultaneous requests', async () => {
    const f = fixture()
    const command = { projectDirectory: '/project', workspaceId: 'main', defaults }
    const results = await Promise.allSettled([
      f.prepare.beginEmpty({ ...command, requestId: 'one' }),
      f.prepare.beginEmpty({ ...command, requestId: 'two' })
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(f.records.size).toBe(1)
    expect(f.content.createAgent).not.toHaveBeenCalled()
  })
})

function fixture() {
  let project = Project.create({
    id: 'project',
    name: 'Project',
    directory: '/project',
    defaultWorkspaceId: 'main'
  })
    .bindDefaultWorkspaceToGit({ directory: '/project', gitBranch: 'main' })
    .toSnapshot()
  let savedDefaults = structuredClone(defaults)
  const records = new Map<string, WorkspaceInitializationSnapshot>()
  const repository: WorkspaceInitializationRepository = {
    getDefaults: async () => structuredClone(savedDefaults),
    saveDefaults: async (_id, value) => {
      savedDefaults = structuredClone(value)
    },
    find: async (id) => structuredClone(records.get(id) ?? null),
    list: async (projectId, workspaceId) =>
      [...records.values()].filter(
        (item) => item.projectId === projectId && (!workspaceId || item.workspaceId === workspaceId)
      ),
    save: async (snapshot) => {
      records.set(snapshot.id, structuredClone(snapshot))
    }
  }
  const projects = {
    findByDirectory: async () => project,
    save: vi.fn(async (value: Project) => {
      project = value.toSnapshot()
    })
  }
  let inspection: GitRepositoryInspection = {
    isGitRepository: true,
    currentBranch: 'main',
    localBranches: ['main'],
    branches: []
  }
  const addGitWorktree = (name: string, directory: string) => {
    inspection = {
      ...inspection,
      localBranches: [...inspection.localBranches, name],
      branches: [
        ...inspection.branches,
        { name, worktreeDirectory: directory, isCurrent: false, isLocked: false, lockReason: null }
      ]
    }
  }
  const git = {
    inspectRepository: vi.fn(async () => inspection),
    createBranchWorktree: vi.fn<GitWorkspacePort['createBranchWorktree']>(async (command) => {
      addGitWorktree(command.branchName, command.worktreeDirectory)
    }),
    isWorkingTreeClean: async () => true,
    checkoutBranch: async () => {},
    removeBranchWorktree: async () => {},
    lockBranchWorktree: async () => {},
    unlockBranchWorktree: async () => {},
    pruneWorktrees: async () => {}
  }
  const directories = {
    resolveBranchWorkspaceDirectory: ({ branchName }: { branchName: string }) =>
      `/worktrees/${branchName}`
  }
  const transactions = new ProjectWorkspaceTransactionCoordinator()
  const base = new CreateBranchWorkspaceUseCase(projects, git, directories, transactions)
  const content = {
    isEmpty: vi.fn(async () => true),
    prepareTemplate: vi.fn(async () => 'Dev'),
    createTemplate: vi.fn(),
    createAgent: vi.fn(),
    run: vi.fn()
  }
  const prepare = new PrepareWorkspaceInitializationUseCase({
    projects,
    registry: {
      get: async () => ({ projectDirectories: ['/project'], currentProjectDirectory: '/project' }),
      save: async () => {}
    },
    git,
    directories,
    repository,
    content,
    transactions,
    createWorkspace: (command, onCreated) => base.execute(command, onCreated)
  })
  return { prepare, content, git, projects, records, project: () => project, addGitWorktree }
}
