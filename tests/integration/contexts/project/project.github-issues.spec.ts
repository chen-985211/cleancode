import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GitHubCliIssueAdapter } from '../../../../src/contexts/project/infrastructure/github/GitHubCliIssueAdapter'

describe('GitHub issue process adapter', () => {
  let directory: string
  let script: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cleancode-gh-'))
    script = join(directory, 'cli.cjs')
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reads structured issues and preserves a search as one process argument', async () => {
    await writeFile(
      script,
      `const args = process.argv.slice(2); if (!args.includes('$(echo unsafe)')) process.exit(1); process.stdout.write(JSON.stringify([{id:'I_1', number:1, title:'Resize', state:'OPEN', labels:[{name:'bug'}], assignees:[{login:'dev'}]}]));`
    )
    const issues = await new GitHubCliIssueAdapter(process.execPath, [script]).list(
      directory,
      'owner/repo',
      { projectDirectory: directory, search: '$(echo unsafe)', limit: 50 }
    )
    expect(issues).toEqual([
      expect.objectContaining({
        number: 1,
        title: 'Resize',
        labels: ['bug'],
        assignees: ['dev'],
        url: 'https://github.com/owner/repo/issues/1'
      })
    ])
  })
  it('maps authentication failures without exposing process output', async () => {
    await writeFile(script, "process.stderr.write('private-token'); process.exit(4)")
    await expect(
      new GitHubCliIssueAdapter(process.execPath, [script]).repository(directory)
    ).rejects.toMatchObject({ code: 'GITHUB_AUTH_REQUIRED' })
  })
  it('rejects malformed provider output', async () => {
    await writeFile(script, "process.stdout.write(JSON.stringify([{number:'bad'}]))")
    await expect(
      new GitHubCliIssueAdapter(process.execPath, [script]).list(directory, 'owner/repo', {
        projectDirectory: directory
      })
    ).rejects.toMatchObject({ code: 'GITHUB_REQUEST_FAILED' })
  })

  it.each([
    ["the 'deepseek-ai/deepseek-harness' repository has disabled issues", 'GITHUB_ISSUES_DISABLED'],
    ['API rate limit exceeded (HTTP 403)', 'GITHUB_RATE_LIMITED'],
    ['Resource not accessible by integration (HTTP 403)', 'GITHUB_PERMISSION_DENIED'],
    ['Could not resolve to a Repository with the name owner/repo', 'GITHUB_RESOURCE_UNAVAILABLE'],
    ['Not Found (HTTP 404)', 'GITHUB_RESOURCE_UNAVAILABLE'],
    ['Bad credentials (HTTP 401)', 'GITHUB_AUTH_REQUIRED'],
    ['Unexpected provider failure', 'GITHUB_REQUEST_FAILED']
  ])('classifies %s without exposing process output', async (stderr, code) => {
    await writeFile(
      script,
      `process.stderr.write(${JSON.stringify(`${stderr}\nprivate-token`)}); process.exit(1)`
    )
    const failure = await new GitHubCliIssueAdapter(process.execPath, [script])
      .list(directory, 'external/project', { projectDirectory: directory })
      .catch((error: unknown) => error)
    expect(failure).toMatchObject({ code })
    expect(String(failure)).not.toContain('private-token')
  })
})
