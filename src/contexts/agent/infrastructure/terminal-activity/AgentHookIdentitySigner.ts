import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { AgentActivityIdentity } from '../../application/dto/AgentActivityProtocol'

const secretBytes = 32

export class AgentHookIdentitySigner {
  private readonly secret: Buffer

  constructor(secret: Uint8Array) {
    if (secret.byteLength !== secretBytes) {
      throw new Error('Agent hook identity secrets must contain exactly 32 bytes.')
    }
    this.secret = Buffer.from(secret)
  }

  sign(identity: AgentActivityIdentity): string {
    return createHmac('sha256', this.secret)
      .update(createTerminalIdentityKey(identity))
      .digest('base64url')
  }

  verify(identity: AgentActivityIdentity, token: string): boolean {
    let received: Buffer
    try {
      received = Buffer.from(token, 'base64url')
    } catch {
      return false
    }
    const expected = Buffer.from(this.sign(identity), 'base64url')
    return received.byteLength === expected.byteLength && timingSafeEqual(received, expected)
  }
}

export async function loadOrCreateAgentHookIdentitySigner(
  secretPath: string
): Promise<AgentHookIdentitySigner> {
  await mkdir(dirname(secretPath), { mode: 0o700, recursive: true })
  let secret: Buffer
  try {
    secret = await readFile(secretPath)
  } catch (error) {
    if (!isMissingFileError(error)) throw error
    const candidate = randomBytes(secretBytes)
    try {
      await writeFile(secretPath, candidate, { flag: 'wx', mode: 0o600 })
      secret = candidate
    } catch (writeError) {
      if (!isExistingFileError(writeError)) throw writeError
      secret = await readFile(secretPath)
    }
  }
  return new AgentHookIdentitySigner(secret)
}

function createTerminalIdentityKey(identity: AgentActivityIdentity): string {
  const terminal = identity.terminal
  const owner = terminal.owner ?? { id: terminal.blockId, kind: 'block' as const }
  return JSON.stringify([
    terminal.projectId,
    terminal.projectDirectory,
    terminal.workspaceId,
    terminal.workspaceDirectory,
    terminal.gitBranch,
    terminal.blockId,
    owner.kind,
    owner.id,
    terminal.sessionId,
    terminal.runId,
    terminal.generation
  ])
}

function isMissingFileError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT'
}

function isExistingFileError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'EEXIST'
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
