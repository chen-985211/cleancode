import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/platform/electron-main/main.ts'),
          'terminal-runtime-provider': resolve(
            __dirname,
            'src/platform/electron-main/terminal-runtime-provider.ts'
          )
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/platform/electron-preload/preload.ts')
      }
    }
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})
