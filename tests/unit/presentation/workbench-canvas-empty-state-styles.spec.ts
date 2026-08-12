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

  it('reveals the CleanCode wordmark with a tokenized tracking expansion', () => {
    const brandRule = readRule('.canvas-empty__brand')
    const normalizedBrandRule = brandRule.replace(/\s+/g, ' ')
    const trackingKeyframes = readRule('@keyframes canvas-empty-brand-tracking')

    expect(themeStyles).toContain('--cc-motion-delay-brand-reveal: 280ms;')
    expect(themeStyles).toContain('--cc-motion-duration-brand-reveal: 700ms;')
    expect(normalizedBrandRule).toContain(
      'animation: canvas-empty-brand-tracking var(--cc-motion-duration-brand-reveal) var(--cc-easing-enter) both;'
    )
    expect(normalizedBrandRule).toContain('animation-delay: var(--cc-motion-delay-brand-reveal);')
    expect(trackingKeyframes).toContain('letter-spacing: -0.42em;')
    expect(trackingKeyframes).toContain('letter-spacing: -0.035em;')
    expect(trackingKeyframes).toContain('opacity: 0;')
    expect(trackingKeyframes).toContain('opacity: 1;')
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
    expect(reducedMotion).toContain('letter-spacing: -0.035em;')
  })
})

function readRule(selector: string): string {
  return canvasStyles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}
