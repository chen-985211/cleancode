import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/** Claude accepts only one append source; keep user text in the private launch file. */
export async function mergeClaudeCodeLaunchInstructions(
  args: readonly string[],
  instructionsPath: string,
  workspaceDirectory: string
): Promise<readonly string[]> {
  const remaining: string[] = []
  let inline: string | undefined
  let file: string | undefined
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === '--') {
      remaining.push(...args.slice(index))
      break
    }
    const separator = arg.indexOf('=')
    const flag = separator < 0 ? arg : arg.slice(0, separator)
    if (flag !== '--append-system-prompt' && flag !== '--append-system-prompt-file') {
      remaining.push(arg)
      continue
    }
    const value = separator < 0 ? args[++index] : arg.slice(separator + 1)
    if (value === undefined) throw new Error(`${flag} requires a value.`)
    if (flag === '--append-system-prompt') inline = value
    else file = value
  }
  if (inline !== undefined && file !== undefined)
    throw new Error('Cannot use both --append-system-prompt and --append-system-prompt-file.')
  if (inline === undefined && file === undefined) return args
  const user = inline ?? (await readFile(resolve(workspaceDirectory, file!), 'utf8'))
  const own = await readFile(instructionsPath, 'utf8')
  await writeFile(instructionsPath, `${user}\n${own}`, { encoding: 'utf8', mode: 0o600 })
  return remaining
}
