import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const styles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/workspace-external-open.css'),
  'utf8'
)

describe('workspace external open statusbar styles', () => {
  it('integrates the control into the statusbar instead of floating above it', () => {
    const controlRule = readRule('.workspace-external-open-control')

    expect(controlRule).toContain('height: 100%;')
    expect(controlRule).toContain('background: transparent;')
    expect(controlRule).not.toContain('border:')
    expect(controlRule).not.toContain('border-radius:')
    expect(styles).not.toContain('.workspace-external-open-control--split {')
    expect(styles).not.toContain('box-shadow: var(--cc-shadow-xs);')
  })
})

function readRule(selector: string): string {
  return styles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}
