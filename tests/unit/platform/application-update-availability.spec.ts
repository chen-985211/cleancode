import { resolveApplicationUpdateAvailability } from '../../../src/platform/electron-main/applicationUpdateAvailability'

describe('application update support', () => {
  it.each([
    ['darwin', false, '', 'unsigned'],
    ['darwin', false, 'Signature=adhoc\nTeamIdentifier=not set', 'unsigned'],
    [
      'darwin',
      false,
      'Authority=Developer ID Application: Example (ABCDE12345)\nTeamIdentifier=ABCDE12345',
      undefined
    ],
    ['linux', true, '', undefined],
    ['linux', false, '', 'unsupported'],
    ['win32', false, '', undefined],
    ['freebsd', false, '', 'unsupported']
  ] as const)(
    'resolves %s install support without bypassing signing or package constraints',
    (platform, isAppImage, macSignature, expected) => {
      expect(
        resolveApplicationUpdateAvailability({
          isPackaged: true,
          platform,
          isAppImage,
          macSignature
        })
      ).toBe(expected)
    }
  )
  it('keeps development builds off the production update feed on all platforms', () => {
    for (const platform of ['darwin', 'linux', 'win32']) {
      expect(
        resolveApplicationUpdateAvailability({ isPackaged: false, platform, isAppImage: true })
      ).toBe('development')
    }
  })
})
