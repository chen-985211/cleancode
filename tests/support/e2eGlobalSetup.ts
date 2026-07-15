import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function setup(): Promise<void> {
  await execFileAsync('pnpm', ['exec', 'electron-vite', 'build'], {
    cwd: process.cwd()
  })
}
