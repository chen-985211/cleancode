import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/** Fold the existing --settings layer into our private layer; never rewrite user files. */
export async function mergeClaudeCodeLaunchSettings(
  args: readonly string[],
  settingsPath: string,
  workspaceDirectory: string
): Promise<readonly string[]> {
  const remaining: string[] = []
  let settings: string | undefined
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === '--settings') {
      settings = args[++index]
      if (!settings) throw new Error('Claude Code --settings requires a value.')
    } else if (arg.startsWith('--settings=')) settings = arg.slice('--settings='.length)
    else remaining.push(arg)
  }
  if (settings === undefined) return args
  const user = parseSettings(
    settings.trim().startsWith('{')
      ? settings
      : await readFile(resolve(workspaceDirectory, settings), 'utf8')
  )
  const own = parseSettings(await readFile(settingsPath, 'utf8'))
  const userHooks = (user.hooks ?? {}) as Record<string, unknown[]>
  const ownHooks = own.hooks as Record<string, unknown[]>
  const hooks = { ...userHooks }
  for (const [event, entries] of Object.entries(ownHooks)) {
    if (hooks[event] !== undefined && !Array.isArray(hooks[event]))
      throw new Error('Invalid Claude Code hook settings.')
    hooks[event] = [...(hooks[event] ?? []), ...entries]
  }
  await writeFile(settingsPath, JSON.stringify({ ...user, hooks }), { mode: 0o600 })
  return remaining
}

function parseSettings(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Claude Code settings.')
  return value as Record<string, unknown>
}
