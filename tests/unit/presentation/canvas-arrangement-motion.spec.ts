import { createCanvasArrangementMotionChoreography } from '../../../src/presentation/app-shell/canvasArrangementMotion'

describe('canvas arrangement motion choreography', () => {
  const items = [
    { nodeIds: ['bottom'] },
    { nodeIds: ['middle-a', 'middle-b'] },
    { nodeIds: ['top'] }
  ]

  it('reveals the top card first and then walks down the stack', () => {
    expect(createCanvasArrangementMotionChoreography(items, 'spread')).toEqual({
      delayByNodeId: {
        bottom: 84,
        'middle-a': 42,
        'middle-b': 42,
        top: 0
      }
    })
  })

  it('collapses in the opposite order so the top card lands last', () => {
    expect(createCanvasArrangementMotionChoreography(items, 'stacked')).toEqual({
      delayByNodeId: {
        bottom: 0,
        'middle-a': 42,
        'middle-b': 42,
        top: 84
      }
    })
  })
})
