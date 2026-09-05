import { defineConfig } from 'vitest/config'

import { e2eTeardownTimeoutMs } from './tests/support/e2eLifecycle'
import { E2eSequencer } from './tests/support/e2eSequencer'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    reporters: ['default', 'json'],
    outputFile: { json: 'test-results/timings/e2e.json' },
    sequence: { sequencer: E2eSequencer },
    globalSetup: ['./tests/support/e2eGlobalSetup.ts'],
    hookTimeout: e2eTeardownTimeoutMs,
    include: ['tests/e2e/**/*.spec.ts'],
    setupFiles: ['./tests/support/vitest.setup.ts'],
    tags: [
      {
        name: 'smoke',
        description: 'Critical cross-context journeys required by the local quality gate.'
      }
    ]
  }
})
