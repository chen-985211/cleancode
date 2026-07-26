import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

type ProjectWorkspaceKind = 'default' | 'linked-worktree'

export interface ProjectWorkspaceSnapshot {
  readonly workspaceId: string
  readonly workspaceKind: ProjectWorkspaceKind
  readonly displayName: string
  readonly directory: string
  readonly gitBranch: string | null
  readonly isCurrent: boolean
}

export interface ProjectSnapshot {
  readonly id: string
  readonly name: string
  readonly directory: string
  readonly workspaces: readonly ProjectWorkspaceSnapshot[]
}

export interface CreateProjectInput {
  readonly id?: string
  readonly defaultWorkspaceId?: string
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
    private readonly workspaceSnapshots: readonly ProjectWorkspaceSnapshot[]
  ) {}

  static create(input: CreateProjectInput): Project {
    const projectId = input.id ?? createProjectId()

    return new Project(projectId, input.name, input.directory, [
      {
        workspaceId: input.defaultWorkspaceId ?? createWorkspaceId(),
        workspaceKind: 'default',
        displayName: 'main',
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

  get workspaces(): readonly ProjectWorkspaceSnapshot[] {
    return this.workspaceSnapshots
  }

  get currentWorkspace(): ProjectWorkspaceSnapshot {
    const currentWorkspace = this.workspaceSnapshots.find((workspace) => workspace.isCurrent)

    if (!currentWorkspace) {
      throw createExpectedAppError(
        'PROJECT_HAS_NO_CURRENT_WORKSPACE',
        'Project has no current branch workspace.'
      )
    }

    return currentWorkspace
  }

  bindDefaultWorkspaceToGit(input: {
    readonly directory: string
    readonly gitBranch: string | null
  }): Project {
    return new Project(
      this.id,
      this.name,
      this.directory,
      this.workspaceSnapshots.map((workspace) =>
        workspace.workspaceKind === 'default'
          ? {
              ...workspace,
              directory: input.directory,
              gitBranch: normalizeOptionalBranchName(input.gitBranch)
            }
          : workspace
      )
    )
  }

  addLinkedWorktreeWorkspace(input: {
    readonly workspaceId?: string
    readonly displayName: string
    readonly directory: string
    readonly gitBranch: string
  }): Project {
    const workspaceId = normalizeRequiredText(
      input.workspaceId ?? createWorkspaceId(),
      'Workspace id cannot be empty.'
    )
    const displayName = normalizeRequiredText(
      input.displayName,
      'Branch workspace name cannot be empty.'
    )
    const gitBranch = normalizeRequiredText(input.gitBranch, 'Git branch cannot be empty.')
    const directory = normalizeRequiredText(
      input.directory,
      'Branch workspace directory cannot be empty.'
    )

    if (this.workspaceSnapshots.some((workspace) => workspace.workspaceId === workspaceId)) {
      throw createExpectedAppError(
        'BRANCH_WORKSPACE_ALREADY_EXISTS',
        'Branch workspace already exists.'
      )
    }

    if (this.workspaceSnapshots.some((workspace) => workspace.displayName === displayName)) {
      throw createExpectedAppError(
        'BRANCH_WORKSPACE_ALREADY_EXISTS',
        'Branch workspace already exists.'
      )
    }

    if (this.workspaceSnapshots.some((workspace) => workspace.gitBranch === gitBranch)) {
      throw createExpectedAppError(
        'GIT_BRANCH_IS_ALREADY_BOUND_TO_WORKSPACE',
        'Git branch is already bound to a workspace.'
      )
    }

    return new Project(this.id, this.name, this.directory, [
      ...this.workspaceSnapshots.map((workspace) => ({ ...workspace, isCurrent: false })),
      {
        workspaceId,
        workspaceKind: 'linked-worktree',
        displayName,
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
    const defaultWorkspace = this.workspaceSnapshots.find(
      (workspace) => workspace.workspaceKind === 'default'
    )
    const currentWorkspaceId = this.currentWorkspace.workspaceId
    const worktreeWorkspaces = input.worktrees.map((worktree) => {
      const branchName = normalizeRequiredText(worktree.branchName, 'Git branch cannot be empty.')
      const directory = normalizeRequiredText(
        worktree.directory,
        'Branch workspace directory cannot be empty.'
      )
      const existingWorkspace = this.workspaceSnapshots.find(
        (workspace) =>
          workspace.workspaceKind === 'linked-worktree' &&
          (workspace.directory === directory || workspace.gitBranch === branchName)
      )

      return {
        workspaceId: existingWorkspace?.workspaceId ?? createWorkspaceId(),
        workspaceKind: 'linked-worktree' as const,
        displayName: existingWorkspace?.displayName ?? branchName,
        directory,
        gitBranch: branchName,
        isCurrent: existingWorkspace?.workspaceId === currentWorkspaceId
      }
    })
    const synchronizedWorkspaces = [
      {
        workspaceId: defaultWorkspace?.workspaceId ?? createWorkspaceId(),
        workspaceKind: 'default' as const,
        displayName: defaultWorkspace?.displayName ?? 'main',
        directory: normalizeRequiredText(
          input.mainDirectory,
          'Branch workspace directory cannot be empty.'
        ),
        gitBranch: normalizeOptionalBranchName(input.mainGitBranch),
        isCurrent: defaultWorkspace?.workspaceId === currentWorkspaceId
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
              isCurrent: workspace.workspaceKind === 'default'
            }))
      )
    )
  }

  switchCurrentWorkspace(workspaceId: string): Project {
    const normalizedWorkspaceId = normalizeRequiredText(
      workspaceId,
      'Workspace id cannot be empty.'
    )
    let hasWorkspace = false

    const workspaces = this.workspaceSnapshots.map((workspace) => {
      const isCurrent = workspace.workspaceId === normalizedWorkspaceId

      if (isCurrent) {
        hasWorkspace = true
      }

      return {
        ...workspace,
        isCurrent
      }
    })

    if (!hasWorkspace) {
      throw createExpectedAppError('BRANCH_WORKSPACE_NOT_FOUND', 'Branch workspace was not found.')
    }

    return new Project(this.id, this.name, this.directory, workspaces)
  }

  archiveLinkedWorktreeWorkspace(workspaceId: string): Project {
    const normalizedWorkspaceId = normalizeRequiredText(
      workspaceId,
      'Workspace id cannot be empty.'
    )

    const archivedWorkspace = this.workspaceSnapshots.find(
      (workspace) => workspace.workspaceId === normalizedWorkspaceId
    )

    if (!archivedWorkspace) {
      throw createExpectedAppError('BRANCH_WORKSPACE_NOT_FOUND', 'Branch workspace was not found.')
    }

    if (archivedWorkspace.workspaceKind === 'default') {
      throw createExpectedAppError(
        'MAIN_WORKSPACE_CANNOT_BE_ARCHIVED',
        'Main workspace cannot be archived.'
      )
    }

    if (!archivedWorkspace.gitBranch) {
      throw createExpectedAppError(
        'ONLY_GIT_WORKTREE_WORKSPACES_CAN_BE_ARCHIVED',
        'Only Git worktree workspaces can be archived.'
      )
    }

    const workspaces = this.workspaceSnapshots
      .filter((workspace) => workspace.workspaceId !== normalizedWorkspaceId)
      .map((workspace) => ({
        ...workspace,
        isCurrent: archivedWorkspace.isCurrent
          ? workspace.workspaceKind === 'default'
          : workspace.isCurrent
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
  workspaces: readonly ProjectWorkspaceSnapshot[]
): readonly ProjectWorkspaceSnapshot[] {
  const seenBranches = new Set<string>()
  const uniqueWorkspaces: ProjectWorkspaceSnapshot[] = []

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

function createWorkspaceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `workspace-${Date.now()}-${Math.random()}`
}

function normalizeBranchWorkspaces(
  projectDirectory: string,
  workspaces: readonly ProjectWorkspaceSnapshot[]
): readonly ProjectWorkspaceSnapshot[] {
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
      workspaceId: normalizeRequiredText(workspace.workspaceId, 'Workspace id cannot be empty.'),
      workspaceKind: workspace.workspaceKind,
      displayName: normalizeRequiredText(
        workspace.displayName,
        'Branch workspace name cannot be empty.'
      ),
      directory: normalizeRequiredText(
        workspace.directory,
        'Branch workspace directory cannot be empty.'
      ),
      gitBranch: normalizeOptionalBranchName(workspace.gitBranch),
      isCurrent
    }
  })
}

function createDefaultWorkspaces(projectDirectory: string): readonly ProjectWorkspaceSnapshot[] {
  return [
    {
      workspaceId: createWorkspaceId(),
      workspaceKind: 'default',
      displayName: 'main',
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
    throw createExpectedAppError('INVALID_CLEANCODE_PROJECT_METADATA', emptyMessage)
  }

  return normalizedValue
}
