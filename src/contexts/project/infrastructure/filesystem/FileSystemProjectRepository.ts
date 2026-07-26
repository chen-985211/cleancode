import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import type { ProjectSnapshot } from '../../application/dto/ProjectSnapshot'
import type { ProjectRepository } from '../../application/ports/ProjectRepository'
import type { Project } from '../../domain/aggregates/Project'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

const projectsDirectoryName = 'projects'
const metadataFileName = 'project.json'

function getProjectMetadataPath(storageDirectory: string, projectDirectory: string): string {
  return join(getProjectStateDirectory(storageDirectory, projectDirectory), metadataFileName)
}

function getProjectStateDirectory(storageDirectory: string, projectDirectory: string): string {
  return join(storageDirectory, projectsDirectoryName, createProjectStorageKey(projectDirectory))
}

function createProjectStorageKey(projectDirectory: string): string {
  return createHash('sha256').update(resolve(projectDirectory)).digest('hex')
}

export function inferProjectName(projectDirectory: string): string {
  return basename(projectDirectory) || 'cleancode-project'
}

export class FileSystemProjectRepository implements ProjectRepository {
  constructor(private readonly storageDirectory: string) {}

  async save(project: Project): Promise<void> {
    const metadataPath = getProjectMetadataPath(this.storageDirectory, project.directory)

    await mkdir(dirname(metadataPath), { recursive: true })
    await writeFile(metadataPath, serializeProject(project.toSnapshot()))
  }

  async findByDirectory(directory: string): Promise<ProjectSnapshot | null> {
    return readProjectSnapshot(getProjectMetadataPath(this.storageDirectory, directory), directory)
  }
}

function serializeProject(snapshot: ProjectSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

function parseProjectSnapshot(metadata: string, directory: string): ProjectSnapshot {
  const parsed = JSON.parse(metadata) as Partial<ProjectSnapshot>

  if (!parsed.id || !parsed.name || !Array.isArray(parsed.workspaces)) {
    throw createExpectedAppError(
      'INVALID_CLEANCODE_PROJECT_METADATA',
      'Invalid cleancode project metadata.'
    )
  }

  return {
    id: parsed.id,
    name: parsed.name,
    directory,
    workspaces: parsed.workspaces.map((workspace) => ({
      workspaceId: workspace.workspaceId,
      workspaceKind: workspace.workspaceKind,
      displayName: workspace.displayName,
      directory: workspace.directory,
      gitBranch: workspace.gitBranch,
      isCurrent: workspace.isCurrent
    }))
  }
}

async function readProjectSnapshot(
  metadataPath: string,
  directory: string
): Promise<ProjectSnapshot | null> {
  try {
    return parseProjectSnapshot(await readFile(metadataPath, 'utf8'), directory)
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}
