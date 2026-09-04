import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const pathFixtureExecutable = 'cleancode-path-fixture'

export async function writeAgentProviderPathFixture(directory: string, version: string) {
  await mkdir(directory, { recursive: true })
  await symlink(process.execPath, join(directory, 'node'))
  await writeProjectPathTool(directory, version)
  await writeFile(
    join(directory, pathFixtureExecutable),
    [
      '#!/usr/bin/env node',
      "const { writeFileSync } = require('node:fs')",
      "const { execFileSync } = require('node:child_process')",
      `const version = ${JSON.stringify(version)}`,
      "if (process.argv[2] === '--version') {",
      '  process.stdout.write(version + "\\n")',
      '} else {',
      "  const toolVersion = execFileSync('project-path-tool', [], { encoding: 'utf8' }).trim()",
      '  writeFileSync(process.argv[2], JSON.stringify({ version, toolVersion, args: process.argv.slice(3) }))',
      '  process.exit(7)',
      '}'
    ].join('\n'),
    { mode: 0o700 }
  )
}

export async function writeAgentProviderLoginProfile(
  homeDirectory: string,
  shell: 'bash' | 'zsh',
  path: string
) {
  await mkdir(homeDirectory, { recursive: true })
  const profile = shell === 'zsh' ? '.zprofile' : '.bash_profile'
  await writeFile(join(homeDirectory, profile), `export PATH=${quotePathFixtureWord(path)}\n`)
  await writeFile(
    join(homeDirectory, shell === 'zsh' ? '.zshrc' : '.bashrc'),
    'PS1=""\nexport PATH="$PWD/bin:$PATH"\n'
  )
}

export async function writeProjectPathTool(directory: string, version: string) {
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'project-path-tool'),
    `#!/bin/sh\nprintf '%s\\n' ${quotePathFixtureWord(version)}\n`,
    { mode: 0o700 }
  )
}

export function quotePathFixtureWord(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
