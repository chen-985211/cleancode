import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const styles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/workbench-canvas.css'),
  'utf8'
)

describe('canvas minimap motion styles', () => {
  it('anchors panel presence to its bottom-right control edge', () => {
    const rule = readRule('.canvas-minimap__panel.anchored-surface-motion')

    expect(rule).toContain('--cc-anchored-surface-origin: 100% 100%;')
    expect(rule).toContain('--cc-anchored-surface-offset-x: 6px;')
    expect(rule).toContain('--cc-anchored-surface-offset-y: 6px;')
  })
})

function readRule(selector: string): string {
  return styles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}
