import { resolveWindowFrameOptions } from '../../../src/platform/electron-main/windowFrameOptions'

describe('platform window frame', () => {
  it('exposes the macOS window-controls safe area to the full-size renderer', () => {
    expect(resolveWindowFrameOptions('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      titleBarOverlay: true
    })
  })

  it('keeps native framing on other desktop platforms', () => {
    expect(resolveWindowFrameOptions('linux')).toEqual({})
    expect(resolveWindowFrameOptions('win32')).toEqual({})
  })
})
