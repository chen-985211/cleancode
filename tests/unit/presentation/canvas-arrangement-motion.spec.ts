import { createCanvasArrangementMotionChoreography } from '../../../src/presentation/app-shell/canvasArrangementMotion'

describe('canvas arrangement motion choreography', () => {
  const items = [
    { nodeIds: ['bottom'] },
    { nodeIds: ['middle-a', 'middle-b'] },
    { nodeIds: ['top'] }
  ]

  it('reveals the top card first and then walks down the stack', () => {
    expect(createCanvasArrangementMotionChoreography(items, 'detach')).toEqual({
      delayByNodeId: {
        bottom: 84,
        'middle-a': 42,
        'middle-b': 42,
        top: 0
      },
      kind: 'detach'
    })
  })

  it('attaches in the opposite order so the top card lands last', () => {
    expect(createCanvasArrangementMotionChoreography(items, 'attach')).toEqual({
      delayByNodeId: {
        bottom: 0,
        'middle-a': 42,
        'middle-b': 42,
        top: 84
      },
      kind: 'attach'
    })
  })

  it('starts every grid item immediately and lets distance shape the motion', () => {
    expect(createCanvasArrangementMotionChoreography(items, 'grid')).toEqual({
      delayByNodeId: {
        bottom: 0,
        'middle-a': 0,
        'middle-b': 0,
        top: 0
      },
      kind: 'grid'
    })
  })
})
