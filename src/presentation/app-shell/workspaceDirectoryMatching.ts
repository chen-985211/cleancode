import type { WorkbenchSnapshot } from './types'

type BranchWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

export function findWorkspaceByDirectory(
  workspaces: readonly BranchWorkspace[],
  directory: string
): BranchWorkspace | null {
  const normalizedDirectory = normalizeDirectoryPath(directory)

  if (!normalizedDirectory) {
    return null
  }

  return (
    [...workspaces]
      .sort((left, right) => right.directory.length - left.directory.length)
      .find((workspace) =>
        isSameOrChildDirectory(normalizedDirectory, normalizeDirectoryPath(workspace.directory))
      ) ?? null
  )
}

function isSameOrChildDirectory(directory: string, parentDirectory: string): boolean {
  if (!directory || !parentDirectory) {
    return false
  }

  return directory === parentDirectory || directory.startsWith(`${parentDirectory}/`)
}

function normalizeDirectoryPath(directory: string): string {
  let normalizedDirectory = directory.trim().replaceAll('\\', '/')

  while (normalizedDirectory.length > 1 && normalizedDirectory.endsWith('/')) {
    normalizedDirectory = normalizedDirectory.slice(0, -1)
  }

  return normalizedDirectory
}
