import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { FileSystemProjectRepository } from '../../../../src/contexts/project/infrastructure/filesystem/FileSystemProjectRepository'
import { CreateProjectUseCase } from '../../../../src/contexts/project/application/use-cases/CreateProjectUseCase'

describe('project filesystem repository', () => {
  let projectDirectory: string
  let appStateDirectory: string

  beforeEach(async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'cleancode-project-'))
    appStateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-app-state-'))
  })

  afterEach(async () => {
    await rm(projectDirectory, { recursive: true, force: true })
    await rm(appStateDirectory, { recursive: true, force: true })
  })

  it('keeps project metadata outside the opened project directory', async () => {
    const repository = new FileSystemProjectRepository(appStateDirectory)
    const createProject = new CreateProjectUseCase(repository)

    const createdProject = await createProject.execute({
      directory: projectDirectory,
      name: 'Local Workbench'
    })

    const metadata = JSON.parse(await readOnlyJsonFile(appStateDirectory, 'project.json')) as {
      id: string
      name: string
      workspaces: Array<{ name: string }>
    }
    const storedProject = await repository.findByDirectory(projectDirectory)

    expect(await pathExists(join(projectDirectory, '.cleancode'))).toBe(false)
    expect(metadata.id).toBe(createdProject.id)
    expect(metadata.name).toBe('Local Workbench')
    expect(metadata.workspaces.map((workspace) => workspace.name)).toEqual(['main'])
    expect(storedProject).toEqual(createdProject)
  })

  it('migrates legacy project metadata from the opened project directory', async () => {
    await mkdir(join(projectDirectory, '.cleancode'), { recursive: true })
    await writeFile(
      join(projectDirectory, '.cleancode', 'project.json'),
      `${JSON.stringify(
        {
          id: 'legacy-project',
          name: 'Legacy Project',
          directory: projectDirectory,
          workspaces: [
            {
              name: 'main',
              directory: projectDirectory,
              gitBranch: null,
              isCurrent: true
            }
          ]
        },
        null,
        2
      )}\n`
    )
    const repository = new FileSystemProjectRepository(appStateDirectory)

    const migratedProject = await repository.findByDirectory(projectDirectory)
    const migratedMetadata = JSON.parse(
      await readOnlyJsonFile(appStateDirectory, 'project.json')
    ) as { id: string; name: string }

    expect(migratedProject?.id).toBe('legacy-project')
    expect(migratedProject?.name).toBe('Legacy Project')
    expect(migratedMetadata).toMatchObject({
      id: 'legacy-project',
      name: 'Legacy Project'
    })
  })
})

async function readOnlyJsonFile(directory: string, fileName: string): Promise<string> {
  const matches = await findFilesNamed(directory, fileName)

  expect(matches).toHaveLength(1)

  return readFile(matches[0]!, 'utf8')
}

async function findFilesNamed(directory: string, fileName: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const matches: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      matches.push(...(await findFilesNamed(path, fileName)))
      continue
    }

    if (entry.isFile() && entry.name === fileName) {
      matches.push(path)
    }
  }

  return matches
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
