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
    return new Project(snapshot.id, snapshot.name, snapshot.directory, snapshot.workspaces)
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

  toSnapshot(): ProjectSnapshot {
    return {
      id: this.id,
      name: this.name,
      directory: this.directory,
      workspaces: this.workspaceSnapshots
    }
  }
}

function createProjectId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random()}`
}
