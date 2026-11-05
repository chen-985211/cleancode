import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function prepareE2eMainProcessEnvironment(
  directory: string,
  environment: Readonly<Record<string, string>> | undefined
): Promise<string[]> {
  if (!environment || Object.keys(environment).length === 0) return []
  const preload = join(directory, 'electron-main-environment.cjs')
  // Playwright strips NODE_OPTIONS from Electron's launch environment.
  await writeFile(preload, `Object.assign(process.env, ${JSON.stringify(environment)})\n`)
  return ['--require', preload]
}
