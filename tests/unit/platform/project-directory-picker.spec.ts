import { posix, win32 } from 'node:path'

import {
  openProjectDirectoryPicker,
  resolveProjectPickerDirectory
} from '../../../src/platform/electron-main/projectDirectoryPicker'

describe('project directory picker', () => {
  it.each([
    {
      pathApi: posix,
      projectDirectory: '/work/team/alpha',
      expected: '/work/team'
    },
    {
      pathApi: win32,
      projectDirectory: String.raw`C:\work\team\alpha`,
      expected: String.raw`C:\work\team`
    }
  ])('resolves the parent directory for $projectDirectory', (input) => {
    expect(resolveProjectPickerDirectory(input.projectDirectory, input.pathApi)).toBe(
      input.expected
    )
  })

  it('opens at an existing remembered directory and returns the selected project', async () => {
    const showOpenDialog = vi.fn(async () => ({
      canceled: false,
      filePaths: ['/work/team/beta']
    }))

    await expect(
      openProjectDirectoryPicker({
        defaultDirectory: '/work/team',
        isDirectory: vi.fn(async () => true),
        showOpenDialog
      })
    ).resolves.toBe('/work/team/beta')
    expect(showOpenDialog).toHaveBeenCalledWith({
      defaultPath: '/work/team',
      properties: ['openDirectory', 'createDirectory']
    })
  })

  it.each([
    { defaultDirectory: null, directoryExists: false },
    { defaultDirectory: '/work/missing', directoryExists: false }
  ])(
    'falls back to the system location for defaultDirectory=$defaultDirectory',
    async ({ defaultDirectory, directoryExists }) => {
      const showOpenDialog = vi.fn(async () => ({ canceled: true, filePaths: [] }))

      await openProjectDirectoryPicker({
        defaultDirectory,
        isDirectory: vi.fn(async () => directoryExists),
        showOpenDialog
      })

      expect(showOpenDialog).toHaveBeenCalledWith({
        properties: ['openDirectory', 'createDirectory']
      })
    }
  )

  it('returns null without changing history when selection is canceled', async () => {
    await expect(
      openProjectDirectoryPicker({
        defaultDirectory: '/work/team',
        isDirectory: vi.fn(async () => true),
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] }))
      })
    ).resolves.toBeNull()
  })
})
