import {
  defaultTerminalBlockSize,
  type TerminalBlockSnapshot
} from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resolveNewTerminalBlockPosition } from '../../../src/presentation/app-shell/terminalBlockPlacement'

describe('terminal block placement', () => {
  it('places the first terminal at the canvas starting position', () => {
    expect(resolveNewTerminalBlockPosition([])).toEqual({ x: 180, y: 270 })
  })

  it('places a new terminal beside an occupied starting position', () => {
    const position = resolveNewTerminalBlockPosition([createTerminalBlock('Terminal 1', 180, 270)])

    expect(position).toEqual({ x: 664, y: 270 })
  })

  it('wraps to the next row when the first row is occupied', () => {
    const position = resolveNewTerminalBlockPosition([
      createTerminalBlock('Terminal 1', 180, 270),
      createTerminalBlock('Terminal 2', 664, 270),
      createTerminalBlock('Terminal 3', 1148, 270)
    ])

    expect(position).toEqual({ x: 180, y: 640 })
  })

  it('skips grid positions covered by a resized terminal block', () => {
    const position = resolveNewTerminalBlockPosition([
      createTerminalBlock('Terminal 1', 180, 270, { width: 904, height: 306 })
    ])

    expect(position).toEqual({ x: 1148, y: 270 })
  })
})

function createTerminalBlock(
  name: string,
  x: number,
  y: number,
  size: TerminalBlockSnapshot['size'] = defaultTerminalBlockSize
): TerminalBlockSnapshot {
  return {
    id: name.toLowerCase().replaceAll(' ', '-'),
    type: 'terminal',
    name,
    description: '本地终端',
    launchCommand: '',
    position: { x, y },
    size
  }
}
