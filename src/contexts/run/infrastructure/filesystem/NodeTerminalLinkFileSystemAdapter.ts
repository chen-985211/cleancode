import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import type {
  ResolveTerminalLinkPathCommand,
  ResolvedTerminalLinkPath,
  TerminalLinkFileSystemPort
} from '../../application/ports/TerminalLinkPorts'

export class NodeTerminalLinkFileSystemAdapter implements TerminalLinkFileSystemPort {
  async resolve(command: ResolveTerminalLinkPathCommand): Promise<ResolvedTerminalLinkPath> {
    const [canonicalWorkspace, canonicalPath] = await Promise.all([
      realpath(command.workspaceDirectory),
      realpath(
        isAbsolute(command.rawPath)
          ? command.rawPath
          : resolve(command.workingDirectory, command.rawPath)
      )
    ])
    const targetStat = await stat(canonicalPath)
    const relativePath = relative(canonicalWorkspace, canonicalPath)

    return {
      canonicalPath,
      kind: targetStat.isFile() ? 'file' : targetStat.isDirectory() ? 'directory' : 'other',
      relativeSegments: relativePath ? relativePath.split(sep) : []
    }
  }
}
