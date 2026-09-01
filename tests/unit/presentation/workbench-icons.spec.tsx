import { render } from '@testing-library/react'

import {
  WorkbenchIcon,
  type WorkbenchIconRole
} from '../../../src/presentation/shared/components/WorkbenchIcons'

const canonicalIconCases = [
  ['terminal', 'terminal-window', 'regular'],
  ['terminal-group', 'stack', 'regular'],
  ['workflow', 'flow-arrow', 'regular'],
  ['agent', 'robot', 'regular'],
  ['canvas', 'squares-four', 'regular'],
  ['launch', 'play', 'fill'],
  ['stop', 'stop', 'fill'],
  ['restart', 'arrow-clockwise', 'bold'],
  ['edit', 'pencil-simple', 'bold'],
  ['confirm', 'check', 'bold'],
  ['close', 'x', 'bold'],
  ['delete', 'trash', 'bold'],
  ['disconnect', 'link-break', 'bold'],
  ['locate', 'crosshair', 'bold'],
  ['fit-canvas', 'corners-out', 'bold'],
  ['minimap', 'map-trifold', 'bold'],
  ['copy', 'copy', 'bold'],
  ['open-external', 'arrow-square-out', 'bold'],
  ['add', 'plus', 'bold'],
  ['more', 'dots-three', 'bold'],
  ['favorite', 'star', 'bold'],
  ['loading', 'circle-notch', 'bold'],
  ['warning', 'warning', 'fill'],
  ['error', 'warning-circle', 'fill'],
  ['paused', 'pause-circle', 'fill'],
  ['approval', 'shield-warning', 'fill']
] as const satisfies readonly (readonly [WorkbenchIconRole, string, string])[]

describe('workbench icon semantics', () => {
  it.each(canonicalIconCases)('%s uses %s with its canonical weight', (role, glyph, weight) => {
    const { container } = render(<WorkbenchIcon role={role} size={16} />)
    const icon = container.querySelector(`[data-icon-role="${role}"]`)

    expect(icon).toMatchObject({
      dataset: expect.objectContaining({ iconGlyph: glyph, iconWeight: weight })
    })
  })

  it('uses weight changes to express retention and trash drop state without changing glyphs', () => {
    const { container, rerender } = render(
      <>
        <WorkbenchIcon active={false} role="retention" size={16} />
        <WorkbenchIcon active={false} role="delete" size={16} />
      </>
    )

    expect(container.querySelector('[data-icon-role="retention"]')).toMatchObject({
      dataset: expect.objectContaining({ iconGlyph: 'push-pin', iconWeight: 'bold' })
    })
    expect(container.querySelector('[data-icon-role="delete"]')).toMatchObject({
      dataset: expect.objectContaining({ iconGlyph: 'trash', iconWeight: 'bold' })
    })

    rerender(
      <>
        <WorkbenchIcon active role="retention" size={16} />
        <WorkbenchIcon active role="delete" size={16} />
      </>
    )

    expect(container.querySelector('[data-icon-role="retention"]')).toHaveAttribute(
      'data-icon-weight',
      'fill'
    )
    expect(container.querySelector('[data-icon-role="delete"]')).toHaveAttribute(
      'data-icon-weight',
      'fill'
    )
  })

  it('switches the canvas arrangement action between the stack and unstack product assets', () => {
    const { container, rerender } = render(
      <WorkbenchIcon active={false} role="arrangement-stack" size={19} />
    )

    const stackIcon = container.querySelector('[data-icon-role="arrangement-stack"]')
    expect(stackIcon?.querySelectorAll('[data-canvas-card]')).toHaveLength(2)
    expect(stackIcon?.querySelector('[data-canvas-unstack-slash]')).not.toBeInTheDocument()
    expect(stackIcon).toMatchObject({
      dataset: expect.objectContaining({
        iconGlyph: 'canvas-stack',
        iconWeight: 'regular'
      })
    })

    rerender(<WorkbenchIcon active role="arrangement-stack" size={19} />)

    const unstackIcon = container.querySelector('[data-icon-role="arrangement-stack"]')
    expect(unstackIcon?.querySelectorAll('[data-canvas-card]')).toHaveLength(2)
    expect(unstackIcon?.querySelector('[data-canvas-unstack-slash]')).toBeInTheDocument()
    expect(unstackIcon).toMatchObject({
      dataset: expect.objectContaining({
        iconGlyph: 'canvas-unstack',
        iconWeight: 'regular'
      })
    })
  })
})
