import { resolveElectronWindowPolicy } from '../../../src/platform/electron-main/electronWindowPolicy'

describe('Electron window policy', () => {
  it('keeps the production window visible without the exact background E2E marker', () => {
    const expectedPolicy = {
      backgroundThrottling: true,
      mode: 'normal',
      show: false
    }

    expect(resolveElectronWindowPolicy({ backgroundE2eMarker: undefined })).toEqual(expectedPolicy)
    expect(resolveElectronWindowPolicy({ backgroundE2eMarker: '0' })).toEqual(expectedPolicy)
    expect(resolveElectronWindowPolicy({ backgroundE2eMarker: 'true' })).toEqual(expectedPolicy)
  })

  it('uses one offscreen inactive policy for background E2E on every platform', () => {
    expect(resolveElectronWindowPolicy({ backgroundE2eMarker: '1' })).toEqual({
      backgroundThrottling: false,
      enableLargerThanScreen: true,
      mode: 'offscreen-inactive',
      position: {
        x: -50_000,
        y: -50_000
      },
      show: false
    })
  })
})
