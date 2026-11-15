import { render } from '@testing-library/react'

import {
  WorkbenchIcon,
  type WorkbenchIconRole
} from '../../../src/presentation/shared/components/WorkbenchIcons'

const canonicalIconCases = [
  ['terminal', 'command-line', 'regular'],
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
  it('uses the original framed command-line paths for every terminal identity', () => {
    const { container } = render(<WorkbenchIcon role="terminal" size={19} />)
    const icon = container.querySelector('svg')!
    expect(icon).toHaveAttribute('viewBox', '0 0 24 24')
    expect(icon).toHaveAttribute('fill', 'none')
    expect([...icon.querySelectorAll('path')].map((path) => path.getAttribute('d'))).toEqual([
      'M14 4H10C6.22876 4 4.34315 4 3.17157 5.17157C2 6.34315 2 8.22876 2 12C2 15.7712 2 17.6569 3.17157 18.8284C4.34315 20 6.22876 20 10 20H14C17.7712 20 19.6569 20 20.8284 18.8284C22 17.6569 22 15.7712 22 12C22 8.22876 22 6.34315 20.8284 5.17157C19.6569 4 17.7712 4 14 4Z',
      'M7 9L8.83981 10.5858C9.61327 11.2525 10 11.5858 10 12C10 12.4142 9.61327 12.7475 8.83981 13.4142L7 15',
      'M13 16H17'
    ])
  })
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
