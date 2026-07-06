import { basename, dirname, join, resolve } from 'node:path'

import type {
  BranchWorkspaceDirectoryPort,
  ResolveBranchWorkspaceDirectoryInput
} from '../../application/ports/BranchWorkspaceDirectoryPort'

const worktreesDirectoryName = 'worktrees'

export class FileSystemBranchWorkspaceDirectoryResolver implements BranchWorkspaceDirectoryPort {
  resolveBranchWorkspaceDirectory(input: ResolveBranchWorkspaceDirectoryInput): string {
    const projectDirectory = resolve(input.projectDirectory)

    return join(
      dirname(projectDirectory),
      worktreesDirectoryName,
      basename(projectDirectory),
      ...createBranchPathSegments(input.branchName)
    )
  }
}

function createBranchPathSegments(branchName: string): string[] {
  return branchName.split('/').map(encodeBranchPathSegment)
}

function encodeBranchPathSegment(segment: string): string {
  const encodedSegment = encodeURIComponent(segment)

  if (encodedSegment === '') {
    return '%00'
  }

  if (encodedSegment === '.') {
    return '%2E'
  }

  if (encodedSegment === '..') {
    return '%2E%2E'
  }

  return encodedSegment
}
