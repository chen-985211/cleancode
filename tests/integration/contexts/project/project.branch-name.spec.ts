import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isValidNewBranchName } from '../../../../src/contexts/project/domain/value-objects/GitBranchName'

const execFileAsync = promisify(execFile)

describe('workspace branch name validation', () => {
  it.each([
    'main',
    'issue/42',
    'feature/修复',
    '@',
    'a@b',
    'a./b',
    '',
    'HEAD',
    '-option',
    'issue/invalid name',
    'issue\ttask',
    'issue/task\u007f',
    'a..b',
    'a@{b',
    'a~b',
    'a^b',
    'a:b',
    'a?b',
    'a*b',
    'a[b',
    'a\\b',
    '.hidden',
    'a/.hidden',
    'a.lock',
    'a.lock/b',
    '/a',
    'a/',
    'a//b',
    'a.'
  ])('matches Git’s literal branch rules for %j', async (branchName) => {
    const accepted = await execFileAsync('git', ['check-ref-format', '--branch', branchName]).then(
      () => true,
      () => false
    )
    expect(isValidNewBranchName(branchName)).toBe(accepted)
  })
})
