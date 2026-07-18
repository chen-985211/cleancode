import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type {
  CheckoutBranchCommand,
  CreateBranchWorktreeCommand,
  GitBranchInspection,
  GitRepositoryInspection,
  GitWorkspacePort,
  LockBranchWorktreeCommand,
  PruneWorktreesCommand,
  RemoveBranchWorktreeCommand,
  UnlockBranchWorktreeCommand
} from '../../application/ports/GitWorkspacePort'

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

export class GitCliWorkspaceAdapter implements GitWorkspacePort {
  async inspectRepository(directory: string): Promise<GitRepositoryInspection> {
    if (!(await isGitRepository(directory))) {
      return {
        isGitRepository: false,
        currentBranch: null,
        localBranches: [],
        branches: []
      }
    }

    const currentBranch = await getCurrentBranch(directory)
    const branches = await getLocalBranchInspections(directory, currentBranch)

    return {
      isGitRepository: true,
      currentBranch,
      localBranches: branches.map((branch) => branch.name),
      branches
    }
  }

  async createBranchWorktree(command: CreateBranchWorktreeCommand): Promise<void> {
    await runGit(command.repositoryDirectory, [
      'worktree',
      'add',
      '-b',
      command.branchName,
      command.worktreeDirectory
    ])
  }

  async isWorkingTreeClean(directory: string): Promise<boolean> {
    const output = await runGit(directory, ['status', '--porcelain'])

    return output.trim().length === 0
  }

  async checkoutBranch(command: CheckoutBranchCommand): Promise<void> {
    await runGit(command.repositoryDirectory, ['checkout', command.branchName])
  }

  async lockBranchWorktree(command: LockBranchWorktreeCommand): Promise<void> {
    const reasonArgs = command.reason ? ['--reason', command.reason] : []
    await runGit(command.repositoryDirectory, [
      'worktree',
      'lock',
      ...reasonArgs,
      command.worktreeDirectory
    ])
  }

  async removeBranchWorktree(command: RemoveBranchWorktreeCommand): Promise<void> {
    await runGit(command.repositoryDirectory, ['worktree', 'remove', command.worktreeDirectory])
  }

  async unlockBranchWorktree(command: UnlockBranchWorktreeCommand): Promise<void> {
    await runGit(command.repositoryDirectory, ['worktree', 'unlock', command.worktreeDirectory])
  }

  async pruneWorktrees(command: PruneWorktreesCommand): Promise<void> {
    await runGit(command.repositoryDirectory, ['worktree', 'prune'])
  }
}

async function isGitRepository(directory: string): Promise<boolean> {
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

async function getCurrentBranch(directory: string): Promise<string | null> {
  const output = await runGit(directory, ['branch', '--show-current'])
  const branch = output.trim()

  return branch ? branch : null
}

async function getLocalBranchInspections(
  directory: string,
  currentBranch: string | null
): Promise<GitBranchInspection[]> {
  const [output, worktreeOutput] = await Promise.all([
    runGit(directory, ['branch', '--format=%(refname:short)%09%(worktreepath)']),
    runGit(directory, ['worktree', 'list', '--porcelain', '-z'])
  ])
  const worktrees = parseWorktreePorcelain(worktreeOutput)

  return output
    .split('\n')
    .map((line) => parseBranchInspectionLine(line, currentBranch, worktrees))
    .filter((branch): branch is GitBranchInspection => Boolean(branch))
}

interface GitWorktreeInspection {
  readonly branchName: string | null
  readonly directory: string
  readonly isLocked: boolean
  readonly lockReason: string | null
}

function parseBranchInspectionLine(
  line: string,
  currentBranch: string | null,
  worktrees: readonly GitWorktreeInspection[]
): GitBranchInspection | null {
  const [branchName, worktreeDirectory] = line.split('\t')
  const name = branchName?.trim()

  if (!name) {
    return null
  }

  const directory = worktreeDirectory?.trim() || null
  const worktree = worktrees.find(
    (candidate) => candidate.directory === directory || candidate.branchName === name
  )

  return {
    name,
    worktreeDirectory: directory,
    isCurrent: name === currentBranch,
    isLocked: worktree?.isLocked ?? false,
    lockReason: worktree?.lockReason ?? null
  }
}

function parseWorktreePorcelain(output: string): GitWorktreeInspection[] {
  const worktrees: GitWorktreeInspection[] = []
  let directory: string | null = null
  let branchName: string | null = null
  let isLocked = false
  let lockReason: string | null = null
  const flush = (): void => {
    if (directory) worktrees.push({ branchName, directory, isLocked, lockReason })
    directory = null
    branchName = null
    isLocked = false
    lockReason = null
  }

  for (const field of output.split('\0')) {
    if (!field) {
      flush()
    } else if (field.startsWith('worktree ')) {
      if (directory) flush()
      directory = field.slice('worktree '.length)
    } else if (field.startsWith('branch refs/heads/')) {
      branchName = field.slice('branch refs/heads/'.length)
    } else if (field === 'locked' || field.startsWith('locked ')) {
      isLocked = true
      lockReason = field === 'locked' ? null : field.slice('locked '.length)
    }
  }
  flush()

  return worktrees
}

async function runGit(directory: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], {
    cwd: directory,
    env: createGitProcessEnvironment()
  })

  return stdout
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
