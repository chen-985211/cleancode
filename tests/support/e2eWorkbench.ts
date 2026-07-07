import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const execFileAsync = promisify(execFile)

export const electronBuildTimeoutMs = 45_000
export const electronLaunchTimeoutMs = 30_000
export const electronScenarioTimeoutMs = 60_000

export interface E2eWorkbench {
  readonly projectDirectory: string
  readonly registryDirectory: string
  readonly appStateDirectory: string
}

export async function buildElectronApp(): Promise<void> {
  await execFileAsync('pnpm', ['exec', 'electron-vite', 'build'], {
    cwd: process.cwd()
  })
}

export async function createE2eWorkbench(prefix: string): Promise<E2eWorkbench> {
  return {
    projectDirectory: await mkdtemp(join(tmpdir(), `${prefix}-project-`)),
    registryDirectory: await mkdtemp(join(tmpdir(), `${prefix}-registry-`)),
    appStateDirectory: await mkdtemp(join(tmpdir(), `${prefix}-state-`))
  }
}

export async function cleanupE2eWorkbench(workbench: E2eWorkbench): Promise<void> {
  await rm(workbench.projectDirectory, { recursive: true, force: true })
  await rm(workbench.registryDirectory, { recursive: true, force: true })
  await rm(workbench.appStateDirectory, { recursive: true, force: true })
}

export function launchApp(workbench: E2eWorkbench): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLEANCODE_TEST_PROJECT_DIRECTORY: workbench.projectDirectory,
      CLEANCODE_TEST_APP_STATE_DIRECTORY: workbench.appStateDirectory,
      CLEANCODE_TEST_PROJECT_REGISTRY_PATH: join(
        workbench.registryDirectory,
        'project-registry.json'
      )
    }
  })
}

export async function readOnlyJsonFile(directory: string, fileName: string): Promise<string> {
  const matches = await findFilesNamed(directory, fileName)

  expect(matches).toHaveLength(1)

  return readFile(matches[0]!, 'utf8')
}

export async function waitForJsonFile(directory: string, fileName: string): Promise<string> {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    const matches = await findFilesNamed(directory, fileName)

    if (matches.length === 1) {
      return readFile(matches[0]!, 'utf8')
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  return readOnlyJsonFile(directory, fileName)
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function expectDesktopRuntime(page: Page): Promise<void> {
  const runtimeState = await page.evaluate(() => ({
    hasCleancodeApi: Boolean(window.cleancode),
    hasPreviewWarning: document.body.textContent?.includes('浏览器预览模式') ?? false
  }))

  expect(runtimeState).toEqual({
    hasCleancodeApi: true,
    hasPreviewWarning: false
  })
}

async function findFilesNamed(directory: string, fileName: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const matches: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      matches.push(...(await findFilesNamed(path, fileName)))
      continue
    }

    if (entry.isFile() && entry.name === fileName) {
      matches.push(path)
    }
  }

  return matches
}
