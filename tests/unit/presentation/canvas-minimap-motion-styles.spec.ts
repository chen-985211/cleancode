import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const styles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/canvas-minimap.css'),
  'utf8'
)

describe('canvas minimap motion styles', () => {
  it('projects one spring presentation into panel height, opacity, and toggle direction', () => {
    const panelRule = readRule('.canvas-minimap__panel')
    const toggleRule = readRule('.canvas-minimap__toggle svg')

    expect(panelRule).toContain('height: var(--canvas-minimap-panel-height);')
    expect(panelRule).toContain('margin-bottom: var(--canvas-minimap-panel-gap);')
    expect(panelRule).toContain('opacity: var(--canvas-minimap-panel-opacity);')
    expect(panelRule).toContain('border: 0;')
    expect(panelRule).toContain('0 0 0 1px var(--cc-border) inset')
    expect(panelRule).not.toContain('border: 1px solid')
    expect(panelRule).not.toContain('transition:')
    expect(toggleRule).toContain('rotate(var(--canvas-minimap-toggle-rotation))')
    expect(styles).not.toContain('.canvas-minimap__panel.anchored-surface-motion')
  })
})

function readRule(selector: string): string {
  return styles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}
