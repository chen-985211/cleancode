import { createRequire } from 'node:module'

const nodeRequire = createRequire(import.meta.url)
const { dir: nativeModuleDirectory } = nodeRequire('node-pty/lib/utils').loadNativeModule('conpty')
const normalizedDirectory = nativeModuleDirectory.replaceAll('\\', '/')

if (!normalizedDirectory.includes('build/Release')) {
  throw new Error(
    `Expected patched node-pty to load from build/Release, received ${nativeModuleDirectory}`
  )
}
