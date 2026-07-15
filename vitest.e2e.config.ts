import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    globalSetup: ['./tests/support/e2eGlobalSetup.ts'],
    include: ['tests/e2e/**/*.spec.ts'],
    setupFiles: ['./tests/support/vitest.setup.ts']
  }
})
