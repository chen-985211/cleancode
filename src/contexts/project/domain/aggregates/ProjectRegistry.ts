import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export interface ProjectRegistrySnapshot {
  readonly currentProjectDirectory: string | null
  readonly projectDirectories: readonly string[]
}

export class ProjectRegistry {
  private constructor(
    private readonly projectDirectories: readonly string[],
    private readonly currentProjectDirectory: string | null
  ) {}

  static empty(): ProjectRegistry {
    return new ProjectRegistry([], null)
  }

  static fromSnapshot(
    snapshot: Pick<ProjectRegistrySnapshot, 'projectDirectories'> &
      Partial<Pick<ProjectRegistrySnapshot, 'currentProjectDirectory'>>
  ): ProjectRegistry {
    const projectDirectories = normalizeProjectDirectories(snapshot.projectDirectories)

    return new ProjectRegistry(
      projectDirectories,
      normalizeCurrentProjectDirectory(snapshot.currentProjectDirectory, projectDirectories)
    )
  }

  rememberProject(directory: string): ProjectRegistry {
    const normalizedDirectory = directory.trim()

    if (!normalizedDirectory) {
      return this
    }

    return new ProjectRegistry(
      [
        normalizedDirectory,
        ...this.projectDirectories.filter((entry) => entry !== normalizedDirectory)
      ],
      normalizedDirectory
    )
  }

  selectCurrentProject(directory: string | null): ProjectRegistry {
    if (directory === null) {
      return new ProjectRegistry(this.projectDirectories, null)
    }

    const normalizedDirectory = directory.trim()

    if (!this.projectDirectories.includes(normalizedDirectory)) {
      throw createExpectedAppError(
        'PROJECT_NOT_REMEMBERED',
        'Cannot select an unremembered project.'
      )
    }

    return new ProjectRegistry(this.projectDirectories, normalizedDirectory)
  }

  forgetProject(directory: string): ProjectRegistry {
    const normalizedDirectory = directory.trim()

    if (!normalizedDirectory) {
      return this
    }

    const projectDirectories = this.projectDirectories.filter(
      (entry) => entry !== normalizedDirectory
    )
    const currentProjectDirectory =
      this.currentProjectDirectory === normalizedDirectory
        ? (projectDirectories[0] ?? null)
        : this.currentProjectDirectory

    return new ProjectRegistry(projectDirectories, currentProjectDirectory)
  }

  toSnapshot(): ProjectRegistrySnapshot {
    return {
      currentProjectDirectory: this.currentProjectDirectory,
      projectDirectories: this.projectDirectories
    }
  }
}

function normalizeCurrentProjectDirectory(
  currentProjectDirectory: string | null | undefined,
  projectDirectories: readonly string[]
): string | null {
  const normalizedDirectory = currentProjectDirectory?.trim()

  return normalizedDirectory && projectDirectories.includes(normalizedDirectory)
    ? normalizedDirectory
    : null
}

function normalizeProjectDirectories(projectDirectories: readonly string[]): string[] {
  const uniqueDirectories: string[] = []

  for (const directory of projectDirectories) {
    const normalizedDirectory = directory.trim()

    if (normalizedDirectory && !uniqueDirectories.includes(normalizedDirectory)) {
      uniqueDirectories.push(normalizedDirectory)
    }
  }

  return uniqueDirectories
}
