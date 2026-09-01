import { createRequire } from 'node:module'

interface PathCondition {
  readonly path?: string
  readonly pathNot?: string
}

interface DependencyRule {
  readonly from: PathCondition
  readonly name: string
  readonly to: PathCondition
}

const require = createRequire(import.meta.url)
const dependencyCruiserConfig = require('../../../.dependency-cruiser.cjs') as {
  readonly forbidden: readonly DependencyRule[]
}

describe('dependency-cruiser presentation boundaries', () => {
  it('blocks every Context Presentation from every Context Infrastructure', () => {
    const rule = getRule('context-presentation-must-not-depend-on-infrastructure')

    expect(
      matchesDependency(rule, {
        from: 'src/contexts/agent/presentation/components/AgentConsole.tsx',
        to: 'src/contexts/agent/infrastructure/persistence/JsonAgentSessionRepository.ts'
      })
    ).toBe(true)
    expect(
      matchesDependency(rule, {
        from: 'src/contexts/agent/presentation/components/AgentConsole.tsx',
        to: 'src/contexts/run/infrastructure/pty/NodePtyTerminalAdapter.ts'
      })
    ).toBe(true)
    expect(
      matchesDependency(rule, {
        from: 'src/contexts/agent/presentation/components/AgentConsole.tsx',
        to: 'src/contexts/agent/application/dto/WorkspaceAgentSnapshot.ts'
      })
    ).toBe(false)
    expect(
      matchesDependency(rule, {
        from: 'src/presentation/app-shell/shell/AppShell.tsx',
        to: 'src/contexts/agent/infrastructure/persistence/JsonAgentSessionRepository.ts'
      })
    ).toBe(false)
  })

  it('allows Shared Presentation to depend only inward or on i18n within root Presentation', () => {
    const rule = getRule('shared-presentation-must-not-depend-on-outer-ui-or-runtime')
    const sharedComponent = 'src/presentation/shared/components/SurfaceMotion.tsx'

    for (const forbiddenTarget of [
      'src/contexts/run/application/dto/TerminalRunEvent.ts',
      'src/platform/renderer-bootstrap/main.tsx',
      'src/presentation/app-shell/shell/AppShell.tsx',
      'src/presentation/layouts/WorkbenchLayout.tsx',
      'src/presentation/routes/ProjectRoute.tsx'
    ]) {
      expect(
        matchesDependency(rule, { from: sharedComponent, to: forbiddenTarget }),
        forbiddenTarget
      ).toBe(true)
    }

    for (const allowedTarget of [
      'src/presentation/shared/motion/motionSpring.ts',
      'src/presentation/i18n/useI18n.ts',
      'src/shared-kernel/application/errors/AppError.ts'
    ]) {
      expect(
        matchesDependency(rule, { from: sharedComponent, to: allowedTarget }),
        allowedTarget
      ).toBe(false)
    }
  })
})

function getRule(name: string): DependencyRule {
  const rule = dependencyCruiserConfig.forbidden.find((candidate) => candidate.name === name)
  if (!rule) throw new Error(`Missing dependency-cruiser rule: ${name}`)
  return rule
}

function matchesDependency(
  rule: DependencyRule,
  dependency: { readonly from: string; readonly to: string }
): boolean {
  return matchesPath(rule.from, dependency.from) && matchesPath(rule.to, dependency.to)
}

function matchesPath(condition: PathCondition, path: string): boolean {
  if (condition.path && !new RegExp(condition.path).test(path)) return false
  return !condition.pathNot || !new RegExp(condition.pathNot).test(path)
}
