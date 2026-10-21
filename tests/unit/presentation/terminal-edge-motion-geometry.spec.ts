import { readTerminalEdgeMotionGeometry } from '../../../src/presentation/app-shell/workbench/nodes/terminal/terminalEdgeMotionGeometry'

const rect = { x: 400, y: 200, width: 560, height: 340 }
const style = (values: Record<string, number>) => ({
  getPropertyValue: (name: string) =>
    values[name.replace('--workbench-object-motion-', '')] === undefined
      ? ''
      : String(values[name.replace('--workbench-object-motion-', '')])
})

describe('terminal edge motion geometry', () => {
  it('uses final canvas geometry when there is no active presentation', () => {
    expect(readTerminalEdgeMotionGeometry(rect, style({}))).toEqual({ ...rect, opacity: 1 })
  })

  it('keeps endpoints on a shell that is moving and growing', () => {
    expect(
      readTerminalEdgeMotionGeometry(
        rect,
        style({
          x: -20,
          y: 30,
          'shell-x': -80,
          'shell-y': 10,
          'shell-width': 220,
          'shell-height': 44
        })
      )
    ).toEqual({ x: 300, y: 240, width: 220, height: 44, opacity: 1 })
  })

  it('accounts for scaling around the shell center and preserves zero opacity', () => {
    expect(readTerminalEdgeMotionGeometry(rect, style({ scale: 0.5, opacity: 0 }))).toEqual({
      x: 540,
      y: 285,
      width: 280,
      height: 170,
      opacity: 0
    })
  })

  it('starts from the previous rectangle before the first spring frame', () => {
    expect(
      readTerminalEdgeMotionGeometry(rect, style({}), {
        id: 'open',
        kind: 'group-reflow',
        offset: { x: 0, y: 0 },
        shellRect: { from: { x: 100, y: 320, width: 220, height: 44 }, to: rect }
      })
    ).toEqual({ x: 100, y: 320, width: 220, height: 44, opacity: 1 })
  })

  it('reads the live presentation when a spring is redirected', () => {
    expect(
      readTerminalEdgeMotionGeometry(rect, style({ 'shell-width': 380, 'shell-height': 180 }), {
        id: 'reverse',
        kind: 'group-reflow',
        offset: { x: 0, y: 0 },
        shellRect: { from: rect, to: { ...rect, width: 220, height: 44 } }
      })
    ).toMatchObject({ width: 380, height: 180 })
  })
})
