import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

interface WebglAddonModule {
  readonly WebglAddon: {
    readonly prototype: {
      readonly setRasterScale?: unknown
      readonly refreshRasterAlignment?: unknown
    }
  }
}

describe('xterm WebGL patched package entries', () => {
  it('exposes raster scaling through both the CJS main and ESM module entries', async () => {
    const require = createRequire(import.meta.url)
    const cjsEntry = require.resolve('@xterm/addon-webgl')
    const cjsModule = require(cjsEntry) as WebglAddonModule
    const esmEntry = pathToFileURL(join(dirname(cjsEntry), 'addon-webgl.mjs')).href
    const esmModule = (await import(/* @vite-ignore */ esmEntry)) as WebglAddonModule

    expect(cjsModule.WebglAddon.prototype.setRasterScale).toBeTypeOf('function')
    expect(esmModule.WebglAddon.prototype.setRasterScale).toBeTypeOf('function')
    expect(cjsModule.WebglAddon.prototype.refreshRasterAlignment).toBeTypeOf('function')
    expect(esmModule.WebglAddon.prototype.refreshRasterAlignment).toBeTypeOf('function')
  })
})
