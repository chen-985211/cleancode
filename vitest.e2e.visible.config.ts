import { defineConfig, mergeConfig } from 'vitest/config'

import e2eConfig from './vitest.e2e.config'

export default mergeConfig(
  e2eConfig,
  defineConfig({
    test: {
      env: {
        CLEANCODE_E2E_VISIBLE: '1'
      }
    }
  })
)
