module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies break high cohesion and low coupling.',
      from: {},
      to: {
        circular: true
      }
    },
    {
      name: 'no-duplicate-dependency-types',
      severity: 'error',
      comment: 'A package must not be declared in more than one dependency section.',
      from: {},
      to: {
        moreThanOneDependencyType: true,
        dependencyTypesNot: ['type-only']
      }
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      comment: 'External packages must be declared explicitly in package.json.',
      from: {},
      to: {
        dependencyTypes: ['npm-no-pkg', 'npm-unknown']
      }
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Imports must resolve to a local file, built-in module, or package.',
      from: {},
      to: {
        couldNotResolve: true
      }
    },
    {
      name: 'domain-must-not-depend-on-outer-layers',
      severity: 'error',
      comment: 'Domain is the innermost DDD/Clean layer and must not depend on outer layers.',
      from: { path: '^src/contexts/[^/]+/domain' },
      to: {
        path: '^src/(contexts/[^/]+/(application|infrastructure|presentation)|platform|presentation)'
      }
    },
    {
      name: 'application-must-not-depend-on-outer-layers',
      severity: 'error',
      comment:
        'Application use cases may depend on domain ports, but not on adapters or UI/runtime layers.',
      from: { path: '^src/contexts/[^/]+/application' },
      to: {
        path: '^src/(contexts/[^/]+/(infrastructure|presentation)|platform|presentation)'
      }
    },
    {
      name: 'contexts-must-not-depend-on-platform',
      severity: 'error',
      comment:
        'Bounded contexts remain runtime-agnostic; platform code composes contexts from the outside.',
      from: { path: '^src/contexts/' },
      to: { path: '^src/platform/' }
    },
    {
      name: 'root-presentation-must-not-depend-on-infrastructure',
      severity: 'error',
      comment:
        'UI depends on application contracts and view models, not infrastructure adapters directly.',
      from: { path: '^src/presentation/' },
      to: { path: '^src/contexts/[^/]+/infrastructure' }
    },
    {
      name: 'context-presentation-must-not-depend-on-app-shell',
      severity: 'error',
      comment:
        'Context-owned UI may depend on shared presentation, but not on App Shell internals.',
      from: { path: '^src/contexts/[^/]+/presentation' },
      to: { path: '^src/presentation/app-shell' }
    },
    {
      name: 'context-presentation-must-not-depend-on-infrastructure',
      severity: 'error',
      comment:
        'Context-owned UI consumes application and presentation contracts, never infrastructure adapters.',
      from: { path: '^src/contexts/[^/]+/presentation' },
      to: { path: '^src/contexts/[^/]+/infrastructure' }
    },
    {
      name: 'shared-presentation-must-not-depend-on-outer-ui-or-runtime',
      severity: 'error',
      comment:
        'Shared presentation may consume its own modules, i18n, and Shared Kernel contracts, but not bounded contexts, Platform, or higher-level UI composition.',
      from: { path: '^src/presentation/shared(?:/|$)' },
      to: {
        path: '^src/(contexts|platform|presentation/)',
        pathNot: '^src/presentation/(shared|i18n)(?:/|$)'
      }
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    exclude: {
      path: '(^|/)(node_modules|out|dist|dist-electron|build|release|coverage)(/|$)'
    },
    extraExtensionsToScan: ['.css'],
    tsConfig: {
      fileName: 'tsconfig.json'
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types']
    },
    tsPreCompilationDeps: true
  }
}
