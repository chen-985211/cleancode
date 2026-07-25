import { constants } from 'node:fs'
import { access, chmod } from 'node:fs/promises'
import { join } from 'node:path'

if (process.platform === 'darwin') {
  const nodePtyPrebuildsDirectory = join(process.cwd(), 'node_modules', 'node-pty', 'prebuilds')

  for (const architecture of ['arm64', 'x64']) {
    const helperPath = join(nodePtyPrebuildsDirectory, `darwin-${architecture}`, 'spawn-helper')

    await chmod(helperPath, 0o755)
    await access(helperPath, constants.X_OK)
  }
}
