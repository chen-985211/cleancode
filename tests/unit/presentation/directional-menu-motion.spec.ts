import {
  directionalMenuMotionProfile,
  resolveDirectionalMenuPresentation
} from '../../../src/presentation/shared/motion/directionalMenuMotion'

describe('directional menu motion', () => {
  it.each([
    [0, 0, 0.72],
    [0.5, 0.725, 0.86],
    [1, 1, 1]
  ])(
    'projects the Agent selector presentation at progress %s',
    (progress, expectedOpacity, expectedScale) => {
      expect(resolveDirectionalMenuPresentation(progress)).toEqual({
        hiddenProgress: 1 - progress,
        opacity: expectedOpacity,
        scale: expectedScale
      })
    }
  )

  it('owns the Agent selector spring response for every directional consumer', () => {
    expect(directionalMenuMotionProfile).toEqual({
      hiddenScale: 0.72,
      opacityLead: 1.45,
      springResponse: 0.4
    })
  })
})
