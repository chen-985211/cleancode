import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const pathFixtureExecutable = 'cleancode-path-fixture'

export async function writeAgentProviderPathFixture(directory: string, version: string) {
  await mkdir(directory, { recursive: true })
  await symlink(process.execPath, join(directory, 'node'))
  await writeFile(
    join(directory, pathFixtureExecutable),
    [
      '#!/usr/bin/env node',
      "const { writeFileSync } = require('node:fs')",
      `const version = ${JSON.stringify(version)}`,
      "if (process.argv[2] === '--version') {",
      '  process.stdout.write(version + "\\n")',
      '} else {',
      '  writeFileSync(process.argv[2], JSON.stringify({ version, args: process.argv.slice(3) }))',
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
  await writeFile(join(homeDirectory, shell === 'zsh' ? '.zshrc' : '.bashrc'), 'PS1=""\n')
}

export function quotePathFixtureWord(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
