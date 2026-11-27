import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

function windowsSnapLayout(): Plugin {
  return {
    name: 'windows-snap-layout',
    apply: 'build',
    buildStart() {
      if (process.platform !== 'win32') return
      const directory = resolve(__dirname, 'native/windows-snap-layout')
      this.addWatchFile(resolve(directory, 'snap_layout.cc'))
      this.addWatchFile(resolve(directory, 'binding.gyp'))
      const require = createRequire(import.meta.url)
      const version: string = require('electron/package.json').version
      execFileSync(
        process.execPath,
        [
          require.resolve('node-gyp/bin/node-gyp.js'),
          'configure',
          'build',
          '--target=' + version,
          '--dist-url=https://www.electronjs.org/headers'
        ],
        { cwd: directory, stdio: 'inherit' }
      )
      this.emitFile({
        type: 'asset',
        fileName: 'windows-snap-layout.node',
        source: readFileSync(resolve(directory, 'build/Release/windows-snap-layout.node'))
      })
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), windowsSnapLayout()],
    build: {
      emitAssets: process.platform === 'win32',
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
    server: {
      open: false
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})
