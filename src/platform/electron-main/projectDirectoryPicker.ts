import { dirname } from 'node:path'

interface ProjectPickerPathApi {
  dirname(path: string): string
}

interface ProjectDirectoryDialogOptions {
  readonly defaultPath?: string
  readonly properties: Array<'openDirectory' | 'createDirectory'>
}

interface ProjectDirectoryDialogResult {
  readonly canceled: boolean
  readonly filePaths: readonly string[]
}

interface OpenProjectDirectoryPickerInput {
  readonly defaultDirectory: string | null
  readonly isDirectory: (directory: string) => Promise<boolean>
  readonly showOpenDialog: (
    options: ProjectDirectoryDialogOptions
  ) => Promise<ProjectDirectoryDialogResult>
}

export function resolveProjectPickerDirectory(
  projectDirectory: string,
  pathApi: ProjectPickerPathApi = { dirname }
): string {
  return pathApi.dirname(projectDirectory)
}

export async function openProjectDirectoryPicker(
  input: OpenProjectDirectoryPickerInput
): Promise<string | null> {
  const defaultPath =
    input.defaultDirectory && (await input.isDirectory(input.defaultDirectory))
      ? input.defaultDirectory
      : null
  const result = await input.showOpenDialog({
    ...(defaultPath ? { defaultPath } : {}),
    properties: ['openDirectory', 'createDirectory']
  })

  return result.canceled ? null : (result.filePaths[0] ?? null)
}
