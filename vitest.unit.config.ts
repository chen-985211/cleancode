import { defineConfig } from 'vitest/config'

const allUnitTests = ['tests/unit/**/*.spec.ts', 'tests/unit/**/*.spec.tsx']
const contextPresentationUnitTests = [
  'tests/unit/contexts/**/*.presentation.spec.ts',
  'tests/unit/contexts/**/*.presentation.spec.tsx'
]
const sharedUnitConfig = {
  globals: true,
  setupFiles: ['./tests/support/vitest.setup.ts']
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...sharedUnitConfig,
          environment: 'node',
          exclude: ['tests/unit/presentation/**', ...contextPresentationUnitTests],
          include: allUnitTests,
          name: 'unit-node'
        }
      },
      {
        test: {
          ...sharedUnitConfig,
          environment: 'jsdom',
          include: [
            'tests/unit/presentation/**/*.spec.ts',
            'tests/unit/presentation/**/*.spec.tsx',
            ...contextPresentationUnitTests
          ],
          name: 'unit-presentation'
        }
      }
    ]
  }
})
