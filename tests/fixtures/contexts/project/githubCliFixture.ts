import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'

// Local, deterministic gh process. No credentials or network are consumed.
export async function createGitHubCliFixture(
  directory: string,
  issuesError?: string
): Promise<NodeJS.ProcessEnv> {
  await mkdir(directory, { recursive: true })
  const body = `
const issue = {id:'I_fixture42', number:42, title:'Fix terminal resizing', state:'OPEN', labels:[{name:'bug'}], assignees:[{login:'developer'}], body:'Resize the terminal window.\\n\\nExpected: the terminal keeps the correct dimensions and remains responsive.'};
const args = process.argv.slice(1).map(arg => require('node:path').basename(arg));
const issuesError = ${JSON.stringify(issuesError ?? '')};
if (args.includes('issue') && issuesError) { process.stderr.write(issuesError); process.exit(1); }
process.stdout.write(JSON.stringify(args.includes('repo') ? {nameWithOwner:'fixture/issues',defaultBranchRef:{name:'main'}} : args.includes('list') ? [issue] : issue));
`
  if (process.platform === 'win32') {
    const preload = join(directory, 'gh-preload.cjs')
    await copyFile(process.execPath, join(directory, 'gh.exe'))
    await writeFile(
      preload,
      `if (require('node:path').basename(process.execPath).toLowerCase() === 'gh.exe') { ${body}; process.exit(0); }`
    )
    return {
      PATH: [directory, dirname(process.execPath), process.env.PATH]
        .filter(Boolean)
        .join(delimiter),
      NODE_OPTIONS: `--require ${JSON.stringify(preload)}`
    }
  }
  const executable = join(directory, 'gh')
  await writeFile(executable, `#!/usr/bin/env node\n${body}`)
  await chmod(executable, 0o755)
  // Provider discovery must not reorder the fixture PATH through the user's login shell.
  const shell = join(directory, 'fixture-shell')
  await writeFile(shell, '#!/usr/bin/env node\nprocess.exit(0)\n')
  await chmod(shell, 0o755)
  return {
    SHELL: shell,
    PATH: [directory, dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter)
  }
}
