export interface ProjectRegistrySnapshot {
  readonly projectDirectories: readonly string[]
}

export class ProjectRegistry {
  private constructor(private readonly projectDirectories: readonly string[]) {}

  static empty(): ProjectRegistry {
    return new ProjectRegistry([])
  }

  static fromSnapshot(snapshot: ProjectRegistrySnapshot): ProjectRegistry {
    return new ProjectRegistry(normalizeProjectDirectories(snapshot.projectDirectories))
  }

  rememberProject(directory: string): ProjectRegistry {
    const normalizedDirectory = directory.trim()

    if (!normalizedDirectory) {
      return this
    }

    return new ProjectRegistry([
      normalizedDirectory,
      ...this.projectDirectories.filter((entry) => entry !== normalizedDirectory)
    ])
  }

  forgetProject(directory: string): ProjectRegistry {
    const normalizedDirectory = directory.trim()

    if (!normalizedDirectory) {
      return this
    }

    return new ProjectRegistry(
      this.projectDirectories.filter((entry) => entry !== normalizedDirectory)
    )
  }

  toSnapshot(): ProjectRegistrySnapshot {
    return {
      projectDirectories: this.projectDirectories
    }
  }
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
