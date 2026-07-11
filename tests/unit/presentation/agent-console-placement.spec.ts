import { resolveNewAgentConsolePosition } from '../../../src/presentation/app-shell/agentConsolePlacement'

describe('Agent console placement', () => {
  it('places a new Agent after the rightmost existing Agent without overlapping it', () => {
    expect(
      resolveNewAgentConsolePosition([
        { position: { x: 540, y: 120 }, size: { width: 440, height: 520 } },
        { position: { x: 1040, y: 180 }, size: { width: 520, height: 460 } }
      ])
    ).toEqual({ x: 1608, y: 120 })
  })
})
