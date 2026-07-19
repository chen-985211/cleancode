import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const tooltipStyles = readFileSync(
  join(process.cwd(), 'src/presentation/app-shell/styles/tooltips.css'),
  'utf8'
)

function readTooltipSurfaceRule(): string {
  return tooltipStyles.split('[data-cc-tooltip]::after {')[1]?.split('}')[0] ?? ''
}

describe('tooltip styles', () => {
  it('wraps long translated copy inside a bounded tooltip surface', () => {
    const tooltipSurfaceRule = readTooltipSurfaceRule()

    expect(tooltipSurfaceRule).toContain('box-sizing: border-box;')
    expect(tooltipSurfaceRule).toContain('width: max-content;')
    expect(tooltipSurfaceRule).toContain('max-width: min(240px, calc(100vw - 24px));')
    expect(tooltipSurfaceRule).toContain('line-height: 1.35;')
    expect(tooltipSurfaceRule).toContain('overflow-wrap: anywhere;')
    expect(tooltipSurfaceRule).toContain('white-space: normal;')
    expect(tooltipSurfaceRule).not.toContain('white-space: nowrap;')
  })
})
