import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import type { ProjectSnapshot } from '../../application/dto/ProjectSnapshot'
import type { ProjectRepository } from '../../application/ports/ProjectRepository'
import { Project } from '../../domain/aggregates/Project'

const projectsDirectoryName = 'projects'
const legacyMetadataDirectoryName = '.cleancode'
const metadataFileName = 'project.json'

function getProjectMetadataPath(storageDirectory: string, projectDirectory: string): string {
  return join(getProjectStateDirectory(storageDirectory, projectDirectory), metadataFileName)
}

function getLegacyProjectMetadataPath(projectDirectory: string): string {
  return join(projectDirectory, legacyMetadataDirectoryName, metadataFileName)
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
    const project = await readProjectSnapshot(
      getProjectMetadataPath(this.storageDirectory, directory),
      directory
    )

    if (project) {
      return project
    }

    const legacyProject = await readProjectSnapshot(
      getLegacyProjectMetadataPath(directory),
      directory
    )

    if (!legacyProject) {
      return null
    }

    await this.save(Project.fromSnapshot(legacyProject))

    return legacyProject
  }
}

function serializeProject(snapshot: ProjectSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

function parseProjectSnapshot(metadata: string, directory: string): ProjectSnapshot {
  const parsed = JSON.parse(metadata) as Partial<ProjectSnapshot>

  if (!parsed.id || !parsed.name || !Array.isArray(parsed.workspaces)) {
    throw new Error('Invalid cleancode project metadata.')
  }

  return {
    id: parsed.id,
    name: parsed.name,
    directory,
    workspaces: parsed.workspaces.map((workspace) => ({
      name: workspace.name,
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
