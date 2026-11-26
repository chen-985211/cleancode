import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const GIT_LOCAL_ENVIRONMENT_VARIABLES = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR'
] as const

export async function runGit(directory: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], {
    cwd: directory,
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: createGitProcessEnvironment()
  })

  return stdout
}

export async function isGitRepository(directory: string): Promise<boolean> {
  try {
    const output = await runGit(directory, ['rev-parse', '--is-inside-work-tree'])
    return output.trim() === 'true'
  } catch (error) {
    if (isConfirmedNonRepositoryError(error)) return false
    throw error
  }
}

function isConfirmedNonRepositoryError(error: unknown): boolean {
  const stderr = (error as { readonly stderr?: unknown } | null)?.stderr

  return typeof stderr === 'string' && stderr.includes('fatal: not a git repository')
}

function createGitProcessEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }

  for (const variableName of GIT_LOCAL_ENVIRONMENT_VARIABLES) {
    delete env[variableName]
  }

  env.LANG = 'C'
  env.LC_ALL = 'C'

  return env
}
