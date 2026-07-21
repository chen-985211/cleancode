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

    expect(position).toEqual({ x: 964, y: 270 })
  })

  it('wraps to the next row when the first row is occupied', () => {
    const position = resolveNewTerminalBlockPosition([
      createTerminalBlock('Terminal 1', 180, 270),
      createTerminalBlock('Terminal 2', 964, 270),
      createTerminalBlock('Terminal 3', 1748, 270)
    ])

    expect(position).toEqual({ x: 180, y: 794 })
  })

  it('skips grid positions covered by a resized terminal block', () => {
    const position = resolveNewTerminalBlockPosition([
      createTerminalBlock('Terminal 1', 180, 270, { width: 904, height: 306 })
    ])

    expect(position).toEqual({ x: 1748, y: 270 })
  })

  it('keeps new terminals close to the existing workbench cluster', () => {
    const position = resolveNewTerminalBlockPosition([
      createTerminalBlock('Terminal 1', 680, 520),
      createTerminalBlock('Terminal 2', 1464, 520)
    ])

    expect(position).toEqual({ x: 2248, y: 520 })
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
