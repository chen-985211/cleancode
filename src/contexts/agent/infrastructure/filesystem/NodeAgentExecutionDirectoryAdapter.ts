import { execFile } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { promisify } from 'node:util'
import type { AgentExecutionDirectoryPort } from '../../application/ports/AgentExecutionDirectoryPort'

const execute = promisify(execFile)

export class NodeAgentExecutionDirectoryAdapter implements AgentExecutionDirectoryPort {
  async resolve(
    command: Parameters<AgentExecutionDirectoryPort['resolve']>[0]
  ): Promise<string | null> {
    if (!isAbsolute(command.executionDirectory) || command.executionDirectory.includes('\0'))
      return null
    try {
      const [home, directory] = await Promise.all([
        realpath(command.workspaceDirectory),
        realpath(command.executionDirectory)
      ])
      if (!(await stat(directory)).isDirectory()) return null
      if (home === directory) return directory
      const [homeRepository, repository] = await Promise.all([
        commonDirectory(home),
        commonDirectory(directory)
      ])
      return homeRepository === repository ? directory : null
    } catch {
      // Removed directories and unrelated/non-Git folders are unconfirmed locations.
      return null
    }
  }
}

async function commonDirectory(directory: string): Promise<string> {
  const { stdout } = await execute(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 64 * 1024,
      env: {
        ...process.env,
        GIT_DIR: undefined,
        GIT_WORK_TREE: undefined,
        GIT_COMMON_DIR: undefined
      }
    }
  )
  return realpath(stdout.trim())
}
