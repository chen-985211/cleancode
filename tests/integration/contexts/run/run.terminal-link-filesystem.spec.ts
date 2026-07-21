import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { NodeTerminalLinkFileSystemAdapter } from '../../../../src/contexts/run/infrastructure/filesystem/NodeTerminalLinkFileSystemAdapter'

describe('terminal link filesystem adapter', () => {
  it('returns canonical relative segments so symlink escapes remain visible to policy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cleancode-terminal-links-'))
    const workspace = join(root, 'workspace')
    const outside = join(root, 'outside')
    await mkdir(workspace)
    await mkdir(outside)
    await writeFile(join(workspace, 'inside.ts'), 'inside')
    await writeFile(join(outside, 'secret.ts'), 'outside')
    await symlink(join(outside, 'secret.ts'), join(workspace, 'escaped.ts'))
    const adapter = new NodeTerminalLinkFileSystemAdapter()

    await expect(
      adapter.resolve({
        rawPath: './inside.ts',
        workingDirectory: workspace,
        workspaceDirectory: workspace
      })
    ).resolves.toMatchObject({ kind: 'file', relativeSegments: ['inside.ts'] })
    await expect(
      adapter.resolve({
        rawPath: './escaped.ts',
        workingDirectory: workspace,
        workspaceDirectory: workspace
      })
    ).resolves.toMatchObject({ relativeSegments: ['..', 'outside', 'secret.ts'] })
  })
})
