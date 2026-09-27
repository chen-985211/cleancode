import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createGitHubCliFixture } from '../../../fixtures/contexts/project/githubCliFixture'

const execute = promisify(execFile)

describe('GitHub CLI process fixture', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cleancode-gh-fixture-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it.each([undefined, "the 'fixture/issues' repository has disabled issues"])(
    'runs from a native path containing spaces with issue error %s',
    async (issuesError) => {
      const bin = join(directory, 'bin with spaces')
      const environment = await createGitHubCliFixture(bin, issuesError)
      const executable = join(bin, process.platform === 'win32' ? 'gh.exe' : 'gh')
      const query = (args: string[]) =>
        execute(executable, args, {
          cwd: directory,
          env: { ...process.env, ...environment },
          timeout: 5000,
          windowsHide: true
        })

      const repository = await query(['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'])
      expect(JSON.parse(repository.stdout)).toEqual({
        nameWithOwner: 'fixture/issues',
        defaultBranchRef: { name: 'main' }
      })

      const issues = query(['issue', 'list', '--repo', 'fixture/issues', '--json', 'number,title'])
      if (issuesError) {
        await expect(issues).rejects.toMatchObject({ code: 1, stderr: issuesError })
      } else {
        expect(JSON.parse((await issues).stdout)).toEqual([
          expect.objectContaining({ number: 42, title: 'Fix terminal resizing' })
        ])
      }
    }
  )
})
