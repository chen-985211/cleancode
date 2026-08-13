import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const canvasStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/workbench-canvas.css'),
  'utf8'
)
const themeStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/theme.css'),
  'utf8'
)

describe('workbench canvas empty state styles', () => {
  it('presents the desktop welcome state as an unframed canvas composition', () => {
    const welcomeRule = readRule('.canvas-empty__welcome')

    expect(welcomeRule).toContain('display: flex;')
    expect(welcomeRule).not.toContain('border:')
    expect(welcomeRule).not.toContain('background:')
    expect(welcomeRule).not.toContain('box-shadow:')
    expect(welcomeRule).not.toContain('backdrop-filter:')
  })

  it('reveals the CleanCode wordmark before a tokenized color band loops across it', () => {
    const brandRule = readRule('.canvas-empty__brand')
    const normalizedBrandRule = brandRule.replace(/\s+/g, ' ')
    const sweepProperty = readRule('@property --cc-canvas-brand-sweep-position')
    const trackingKeyframes = readRule('@keyframes canvas-empty-brand-tracking')
    const sweepKeyframes = readRule('@keyframes canvas-empty-brand-sweep')

    expect(themeStyles).toContain('--cc-motion-delay-brand-reveal: 280ms;')
    expect(themeStyles).toContain('--cc-motion-duration-brand-reveal: 700ms;')
    expect(themeStyles).toContain('--cc-motion-delay-brand-sweep: 1480ms;')
    expect(themeStyles).toContain('--cc-motion-duration-brand-sweep: 2300ms;')
    expect(normalizedBrandRule).toContain(
      'canvas-empty-brand-tracking var(--cc-motion-duration-brand-reveal) var(--cc-easing-enter) var(--cc-motion-delay-brand-reveal) both'
    )
    expect(normalizedBrandRule).toContain(
      'canvas-empty-brand-sweep var(--cc-motion-duration-brand-sweep) var(--cc-easing-brand-sweep) var(--cc-motion-delay-brand-sweep) infinite'
    )
    expect(sweepProperty).toContain("syntax: '<percentage>';")
    expect(sweepProperty).toContain('initial-value: 117%;')
    expect(normalizedBrandRule).toContain('--cc-canvas-brand-sweep-position: 117%;')
    expect(normalizedBrandRule).toContain('var(--cc-canvas-brand-sweep-position)')
    expect(normalizedBrandRule).toContain('transparent')
    expect(normalizedBrandRule).toContain('background-clip: text;')
    expect(normalizedBrandRule).not.toContain('background-position:')
    expect(normalizedBrandRule).not.toContain('background-size: 300% 100%;')
    expect(trackingKeyframes).toContain('letter-spacing: -0.42em;')
    expect(trackingKeyframes).toContain('letter-spacing: -0.035em;')
    expect(trackingKeyframes).toContain('opacity: 0;')
    expect(trackingKeyframes).toContain('opacity: 1;')
    expect(sweepKeyframes).toContain('--cc-canvas-brand-sweep-position: -17%;')
    expect(sweepKeyframes).toContain('65%,')
    expect(sweepKeyframes).toContain('--cc-canvas-brand-sweep-position: 117%;')
  })

  it('keeps the open-project action neutral instead of using the primary fill', () => {
    const actionRule = readRule('.canvas-empty--welcome .canvas-empty__action')
    const hoverRule = readRule('.canvas-empty--welcome .canvas-empty__action:hover')

    expect(actionRule).toContain('border-color: var(--cc-border-strong);')
    expect(actionRule).toContain('background: var(--cc-surface-translucent);')
    expect(actionRule).toContain('color: var(--cc-foreground);')
    expect(actionRule).not.toContain('background: var(--cc-primary);')
    expect(hoverRule).toContain('background: var(--cc-surface-raised);')
    expect(hoverRule).not.toContain('var(--cc-primary')
  })

  it('projects the final wordmark immediately when reduced motion is requested', () => {
    const reducedMotion = canvasStyles.split('@media (prefers-reduced-motion: reduce)')[1] ?? ''

    expect(reducedMotion).toContain('.canvas-empty__brand')
    expect(reducedMotion).toContain('animation: none;')
    expect(reducedMotion).toContain('background: none;')
    expect(reducedMotion).toContain('-webkit-text-fill-color: currentcolor;')
    expect(reducedMotion).toContain('letter-spacing: -0.035em;')
  })
})

function readRule(selector: string): string {
  return canvasStyles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}
