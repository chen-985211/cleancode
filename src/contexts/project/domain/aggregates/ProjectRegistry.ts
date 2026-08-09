import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export interface ProjectRegistrySnapshot {
  readonly currentProjectDirectory: string | null
  readonly projectDirectories: readonly string[]
  readonly projectPickerDirectory?: string | null
}

export class ProjectRegistry {
  private constructor(
    private readonly projectDirectories: readonly string[],
    private readonly currentProjectDirectory: string | null,
    private readonly projectPickerDirectory: string | null
  ) {}

  static empty(): ProjectRegistry {
    return new ProjectRegistry([], null, null)
  }

  static fromSnapshot(
    snapshot: Pick<ProjectRegistrySnapshot, 'projectDirectories'> &
      Partial<Pick<ProjectRegistrySnapshot, 'currentProjectDirectory' | 'projectPickerDirectory'>>
  ): ProjectRegistry {
    const projectDirectories = normalizeProjectDirectories(snapshot.projectDirectories)

    return new ProjectRegistry(
      projectDirectories,
      normalizeCurrentProjectDirectory(snapshot.currentProjectDirectory, projectDirectories),
      normalizeProjectPickerDirectory(snapshot.projectPickerDirectory)
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
      normalizedDirectory,
      this.projectPickerDirectory
    )
  }

  rememberProjectPickerDirectory(directory: string): ProjectRegistry {
    const normalizedDirectory = directory.trim()

    return normalizedDirectory
      ? new ProjectRegistry(
          this.projectDirectories,
          this.currentProjectDirectory,
          normalizedDirectory
        )
      : this
  }

  selectCurrentProject(directory: string | null): ProjectRegistry {
    if (directory === null) {
      return new ProjectRegistry(this.projectDirectories, null, this.projectPickerDirectory)
    }

    const normalizedDirectory = directory.trim()

    if (!this.projectDirectories.includes(normalizedDirectory)) {
      throw createExpectedAppError(
        'PROJECT_NOT_REMEMBERED',
        'Cannot select an unremembered project.'
      )
    }

    return new ProjectRegistry(
      this.projectDirectories,
      normalizedDirectory,
      this.projectPickerDirectory
    )
  }

  moveProjectBefore(directory: string, beforeDirectory: string | null): ProjectRegistry {
    const normalizedDirectory = directory.trim()

    if (!this.projectDirectories.includes(normalizedDirectory)) {
      throw createExpectedAppError(
        'PROJECT_NOT_REMEMBERED',
        'Cannot reorder an unremembered project.'
      )
    }

    const normalizedBeforeDirectory = beforeDirectory?.trim() ?? null

    if (
      normalizedBeforeDirectory !== null &&
      !this.projectDirectories.includes(normalizedBeforeDirectory)
    ) {
      throw createExpectedAppError(
        'PROJECT_NOT_REMEMBERED',
        'Cannot reorder before an unremembered project.'
      )
    }

    if (normalizedDirectory === normalizedBeforeDirectory) {
      return this
    }

    const remainingDirectories = this.projectDirectories.filter(
      (entry) => entry !== normalizedDirectory
    )
    const insertIndex =
      normalizedBeforeDirectory === null
        ? remainingDirectories.length
        : remainingDirectories.indexOf(normalizedBeforeDirectory)
    const projectDirectories = [...remainingDirectories]

    projectDirectories.splice(insertIndex, 0, normalizedDirectory)

    if (projectDirectories.every((entry, index) => entry === this.projectDirectories[index])) {
      return this
    }

    return new ProjectRegistry(
      projectDirectories,
      this.currentProjectDirectory,
      this.projectPickerDirectory
    )
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

    return new ProjectRegistry(
      projectDirectories,
      currentProjectDirectory,
      this.projectPickerDirectory
    )
  }

  toSnapshot(): ProjectRegistrySnapshot {
    return {
      currentProjectDirectory: this.currentProjectDirectory,
      projectDirectories: this.projectDirectories,
      ...(this.projectPickerDirectory
        ? { projectPickerDirectory: this.projectPickerDirectory }
        : {})
    }
  }
}

function normalizeProjectPickerDirectory(directory: string | null | undefined): string | null {
  return directory?.trim() || null
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
