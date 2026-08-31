import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const tooltipStyles = readFileSync(
  join(process.cwd(), 'src/presentation/shared/styles/tooltips.css'),
  'utf8'
)

function readTooltipSurfaceRule(): string {
  return tooltipStyles.split('.cc-tooltip-content {')[1]?.split('}')[0] ?? ''
}

describe('tooltip styles', () => {
  it('wraps long translated copy inside a bounded tooltip surface', () => {
    const tooltipSurfaceRule = readTooltipSurfaceRule()

    expect(tooltipSurfaceRule).toContain('box-sizing: border-box;')
    expect(tooltipSurfaceRule).toContain('width: max-content;')
    expect(tooltipSurfaceRule).toContain('max-width: min(240px, calc(100vw - 24px));')
    expect(tooltipSurfaceRule).toContain('line-height: 1.25;')
    expect(tooltipSurfaceRule).toContain('overflow-wrap: anywhere;')
    expect(tooltipSurfaceRule).toContain('white-space: normal;')
    expect(tooltipSurfaceRule).toContain('pointer-events: none;')
    expect(tooltipSurfaceRule).not.toContain('white-space: nowrap;')
  })

  it('uses the compact high-contrast Orca tooltip treatment', () => {
    const tooltipSurfaceRule = readTooltipSurfaceRule()

    expect(tooltipSurfaceRule).toContain('border: 0;')
    expect(tooltipSurfaceRule).toContain('border-radius: 6px;')
    expect(tooltipSurfaceRule).toContain('font-size: 12px;')
    expect(tooltipSurfaceRule).toContain('font-weight: 500;')
    expect(tooltipSurfaceRule).toContain('padding: 6px 12px;')
    expect(tooltipSurfaceRule).toContain('box-shadow: none;')
  })

  it('removes motion when the user prefers reduced motion', () => {
    expect(tooltipStyles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(tooltipStyles).toContain('transition: none;')
  })

  it('keeps the Radix positioning wrapper from intercepting nearby controls', () => {
    const wrapperRule =
      tooltipStyles
        .split('[data-radix-popper-content-wrapper]:has(.cc-tooltip-content) {')[1]
        ?.split('}')[0] ?? ''

    expect(wrapperRule).toContain('pointer-events: none;')
  })
})
