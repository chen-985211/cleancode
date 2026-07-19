import { resolveWindowFrameOptions } from '../../../src/platform/electron-main/windowFrameOptions'

describe('platform window frame', () => {
  it('uses native inset chrome without a titlebar overlay on macOS', () => {
    expect(resolveWindowFrameOptions('darwin')).toEqual({
      acceptFirstMouse: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 12 }
    })
  })

  it('keeps native framing on other desktop platforms', () => {
    expect(resolveWindowFrameOptions('linux')).toEqual({})
    expect(resolveWindowFrameOptions('win32')).toEqual({})
  })
})
