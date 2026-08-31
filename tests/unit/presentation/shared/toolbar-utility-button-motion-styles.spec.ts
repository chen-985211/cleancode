import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const styles = readFileSync(
  resolve(process.cwd(), 'src/presentation/shared/styles/toolbar-utility-button-motion.css'),
  'utf8'
)

describe('toolbar utility button motion styles', () => {
  it('projects the shared spring variables without a competing transform transition', () => {
    const buttonRule = readRule('.toolbar-utility-button')

    expect(buttonRule).toContain('var(--toolbar-utility-motion-y, 0px)')
    expect(buttonRule).toContain('var(--toolbar-utility-motion-scale, 1)')
    expect(buttonRule).not.toContain('transform var(')
  })
})

function readRule(selector: string): string {
  return styles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}
