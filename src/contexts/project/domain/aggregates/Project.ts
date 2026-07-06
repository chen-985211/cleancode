export interface BranchWorkspaceSnapshot {
  readonly name: string
  readonly directory: string
  readonly gitBranch: string | null
  readonly isCurrent: boolean
}

export interface ProjectSnapshot {
  readonly id: string
  readonly name: string
  readonly directory: string
  readonly workspaces: readonly BranchWorkspaceSnapshot[]
}

export interface CreateProjectInput {
  readonly id?: string
  readonly name: string
  readonly directory: string
}

export interface GitBranchWorktreeInput {
  readonly branchName: string
  readonly directory: string
}

export class Project {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly directory: string,
    private readonly workspaceSnapshots: readonly BranchWorkspaceSnapshot[]
  ) {}

  static create(input: CreateProjectInput): Project {
    const projectId = input.id ?? createProjectId()

    return new Project(projectId, input.name, input.directory, [
      {
        name: 'main',
        directory: input.directory,
        gitBranch: null,
        isCurrent: true
      }
    ])
  }

  static fromSnapshot(snapshot: ProjectSnapshot): Project {
    return new Project(
      snapshot.id,
      snapshot.name,
      snapshot.directory,
      normalizeBranchWorkspaces(snapshot.directory, snapshot.workspaces)
    )
  }

  get workspaces(): readonly BranchWorkspaceSnapshot[] {
    return this.workspaceSnapshots
  }

  get currentWorkspace(): BranchWorkspaceSnapshot {
    const currentWorkspace = this.workspaceSnapshots.find((workspace) => workspace.isCurrent)

    if (!currentWorkspace) {
      throw new Error('Project has no current branch workspace.')
    }

    return currentWorkspace
  }

  bindMainWorkspaceToGit(input: {
    readonly directory: string
    readonly gitBranch: string | null
  }): Project {
    return new Project(
      this.id,
      this.name,
      this.directory,
      this.workspaceSnapshots.map((workspace) =>
        workspace.name === 'main'
          ? {
              ...workspace,
              directory: input.directory,
              gitBranch: normalizeOptionalBranchName(input.gitBranch)
            }
          : workspace
      )
    )
  }

  addBranchWorkspace(input: {
    readonly name: string
    readonly directory: string
    readonly gitBranch: string
  }): Project {
    const workspaceName = normalizeRequiredText(
      input.name,
      'Branch workspace name cannot be empty.'
    )
    const gitBranch = normalizeRequiredText(input.gitBranch, 'Git branch cannot be empty.')
    const directory = normalizeRequiredText(
      input.directory,
      'Branch workspace directory cannot be empty.'
    )

    if (this.workspaceSnapshots.some((workspace) => workspace.name === workspaceName)) {
      throw new Error('Branch workspace already exists.')
    }

    if (this.workspaceSnapshots.some((workspace) => workspace.gitBranch === gitBranch)) {
      throw new Error('Git branch is already bound to a workspace.')
    }

    return new Project(this.id, this.name, this.directory, [
      ...this.workspaceSnapshots.map((workspace) => ({ ...workspace, isCurrent: false })),
      {
        name: workspaceName,
        directory,
        gitBranch,
        isCurrent: true
      }
    ])
  }

  syncGitBranchWorkspaces(input: {
    readonly mainDirectory: string
    readonly mainGitBranch: string | null
    readonly worktrees: readonly GitBranchWorktreeInput[]
  }): Project {
    const mainWorkspace = this.workspaceSnapshots.find((workspace) => workspace.name === 'main')
    const currentWorkspaceName = this.currentWorkspace.name
    const worktreeWorkspaces = input.worktrees.map((worktree) => {
      const branchName = normalizeRequiredText(worktree.branchName, 'Git branch cannot be empty.')
      const directory = normalizeRequiredText(
        worktree.directory,
        'Branch workspace directory cannot be empty.'
      )
      const existingWorkspace = this.workspaceSnapshots.find(
        (workspace) => workspace.name === branchName || workspace.gitBranch === branchName
      )

      return {
        name: branchName,
        directory,
        gitBranch: branchName,
        isCurrent: existingWorkspace?.isCurrent ?? currentWorkspaceName === branchName
      }
    })
    const synchronizedWorkspaces = [
      {
        name: 'main',
        directory: normalizeRequiredText(
          input.mainDirectory,
          'Branch workspace directory cannot be empty.'
        ),
        gitBranch: normalizeOptionalBranchName(input.mainGitBranch),
        isCurrent: mainWorkspace?.isCurrent ?? currentWorkspaceName === 'main'
      },
      ...deduplicateBranchWorkspaces(worktreeWorkspaces)
    ]
    const hasCurrentWorkspace = synchronizedWorkspaces.some((workspace) => workspace.isCurrent)

    return new Project(
      this.id,
      this.name,
      this.directory,
      normalizeBranchWorkspaces(
        this.directory,
        hasCurrentWorkspace
          ? synchronizedWorkspaces
          : synchronizedWorkspaces.map((workspace) => ({
              ...workspace,
              isCurrent: workspace.name === 'main'
            }))
      )
    )
  }

  switchCurrentWorkspace(workspaceName: string): Project {
    const normalizedWorkspaceName = normalizeRequiredText(
      workspaceName,
      'Branch workspace name cannot be empty.'
    )
    let hasWorkspace = false

    const workspaces = this.workspaceSnapshots.map((workspace) => {
      const isCurrent = workspace.name === normalizedWorkspaceName

      if (isCurrent) {
        hasWorkspace = true
      }

      return {
        ...workspace,
        isCurrent
      }
    })

    if (!hasWorkspace) {
      throw new Error('Branch workspace was not found.')
    }

    return new Project(this.id, this.name, this.directory, workspaces)
  }

  archiveBranchWorkspace(workspaceName: string): Project {
    const normalizedWorkspaceName = normalizeRequiredText(
      workspaceName,
      'Branch workspace name cannot be empty.'
    )

    if (normalizedWorkspaceName === 'main') {
      throw new Error('Main workspace cannot be archived.')
    }

    const archivedWorkspace = this.workspaceSnapshots.find(
      (workspace) => workspace.name === normalizedWorkspaceName
    )

    if (!archivedWorkspace) {
      throw new Error('Branch workspace was not found.')
    }

    if (!archivedWorkspace.gitBranch) {
      throw new Error('Only Git worktree workspaces can be archived.')
    }

    const workspaces = this.workspaceSnapshots
      .filter((workspace) => workspace.name !== normalizedWorkspaceName)
      .map((workspace) => ({
        ...workspace,
        isCurrent: archivedWorkspace.isCurrent ? workspace.name === 'main' : workspace.isCurrent
      }))

    return new Project(
      this.id,
      this.name,
      this.directory,
      normalizeBranchWorkspaces(this.directory, workspaces)
    )
  }

  toSnapshot(): ProjectSnapshot {
    return {
      id: this.id,
      name: this.name,
      directory: this.directory,
      workspaces: this.workspaceSnapshots
    }
  }
}

function deduplicateBranchWorkspaces(
  workspaces: readonly BranchWorkspaceSnapshot[]
): readonly BranchWorkspaceSnapshot[] {
  const seenBranches = new Set<string>()
  const uniqueWorkspaces: BranchWorkspaceSnapshot[] = []

  for (const workspace of workspaces) {
    if (!workspace.gitBranch || seenBranches.has(workspace.gitBranch)) {
      continue
    }

    seenBranches.add(workspace.gitBranch)
    uniqueWorkspaces.push(workspace)
  }

  return uniqueWorkspaces
}

function createProjectId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random()}`
}

function normalizeBranchWorkspaces(
  projectDirectory: string,
  workspaces: readonly BranchWorkspaceSnapshot[]
): readonly BranchWorkspaceSnapshot[] {
  const normalizedWorkspaces =
    workspaces.length > 0 ? workspaces : createDefaultWorkspaces(projectDirectory)
  const hasCurrentWorkspace = normalizedWorkspaces.some((workspace) => workspace.isCurrent)
  let hasSelectedCurrentWorkspace = false

  return normalizedWorkspaces.map((workspace, index) => {
    const isCurrent = hasCurrentWorkspace
      ? workspace.isCurrent && !hasSelectedCurrentWorkspace
      : index === 0

    if (isCurrent) {
      hasSelectedCurrentWorkspace = true
    }

    return {
      name: normalizeRequiredText(workspace.name, 'Branch workspace name cannot be empty.'),
      directory: normalizeRequiredText(
        workspace.directory,
        'Branch workspace directory cannot be empty.'
      ),
      gitBranch: normalizeOptionalBranchName(workspace.gitBranch),
      isCurrent
    }
  })
}

function createDefaultWorkspaces(projectDirectory: string): readonly BranchWorkspaceSnapshot[] {
  return [
    {
      name: 'main',
      directory: projectDirectory,
      gitBranch: null,
      isCurrent: true
    }
  ]
}

function normalizeOptionalBranchName(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const normalizedValue = value.trim()

  return normalizedValue ? normalizedValue : null
}

function normalizeRequiredText(value: string, emptyMessage: string): string {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    throw new Error(emptyMessage)
  }

  return normalizedValue
}
