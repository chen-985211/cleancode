import { createOrganizedCanvasLayout } from '../../../../src/contexts/canvas-arrangement/domain/services/CanvasOrganizationLayoutPolicy'

describe('canvas organization geometry validation', () => {
  const agent = {
    key: 'agent:a',
    kind: 'agent' as const,
    position: { x: 0, y: 0 },
    size: { width: 720, height: 460 }
  }
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid width %s even for a single object',
    (width) => {
      expect(() =>
        createOrganizedCanvasLayout([{ ...agent, size: { ...agent.size, width } }])
      ).toThrow()
    }
  )
  it('rejects duplicate identities across regions', () => {
    expect(() => createOrganizedCanvasLayout([agent, { ...agent, kind: 'terminal' }])).toThrow()
  })
})
