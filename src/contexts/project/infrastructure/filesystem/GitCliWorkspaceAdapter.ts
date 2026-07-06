import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type {
  CheckoutBranchCommand,
  CreateBranchWorktreeCommand,
  GitBranchInspection,
  GitRepositoryInspection,
  GitWorkspacePort
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
}

async function isGitRepository(directory: string): Promise<boolean> {
  try {
    await runGit(directory, ['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
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
  const output = await runGit(directory, ['branch', '--format=%(refname:short)%09%(worktreepath)'])

  return output
    .split('\n')
    .map((line) => parseBranchInspectionLine(line, currentBranch))
    .filter((branch): branch is GitBranchInspection => Boolean(branch))
}

function parseBranchInspectionLine(
  line: string,
  currentBranch: string | null
): GitBranchInspection | null {
  const [branchName, worktreeDirectory] = line.split('\t')
  const name = branchName?.trim()

  if (!name) {
    return null
  }

  return {
    name,
    worktreeDirectory: worktreeDirectory?.trim() || null,
    isCurrent: name === currentBranch
  }
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

  return env
}
