import { resolveWindowFrameOptions } from '../../../src/platform/electron-main/windowFrameOptions'

describe('platform window frame', () => {
  it('lets the renderer title bar share the macOS traffic-light region', () => {
    expect(resolveWindowFrameOptions('darwin')).toEqual({ titleBarStyle: 'hiddenInset' })
  })

  it('keeps native framing on other desktop platforms', () => {
    expect(resolveWindowFrameOptions('linux')).toEqual({})
    expect(resolveWindowFrameOptions('win32')).toEqual({})
  })
})
