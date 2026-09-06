import { readFile } from 'node:fs/promises'
import { dirname, join, win32 } from 'node:path'

/** Preserve the original system policy and its defaults when installing a launch overlay. */
export async function readGeminiSystemSettings(
  environment: Readonly<Record<string, string>>,
  platform: NodeJS.Platform
) {
  const effectiveEnvironment = { ...process.env, ...environment }
  const path =
    effectiveEnvironment.GEMINI_CLI_SYSTEM_SETTINGS_PATH ||
    (platform === 'darwin'
      ? '/Library/Application Support/GeminiCli/settings.json'
      : platform === 'win32'
        ? 'C:\\ProgramData\\gemini-cli\\settings.json'
        : '/etc/gemini-cli/settings.json')
  let settings: Record<string, unknown> = {}
  try {
    settings = parseSettings(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const paths = platform === 'win32' ? win32 : { dirname, join }
  const defaults =
    effectiveEnvironment.GEMINI_CLI_SYSTEM_DEFAULTS_PATH ||
    paths.join(paths.dirname(path), 'system-defaults.json')
  return { settings, defaults }
}

export function mergeGeminiSettings(
  base: Record<string, unknown>,
  added: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base }
  for (const [key, value] of Object.entries(added)) {
    const prior = result[key]
    result[key] =
      Array.isArray(prior) && Array.isArray(value)
        ? [...prior, ...value]
        : isRecord(prior) && isRecord(value)
          ? mergeGeminiSettings(prior, value)
          : value
  }
  return result
}

export function createGeminiHookCommand(
  executable: string,
  relay: string,
  platform: NodeJS.Platform
): string {
  const quote = (value: string) =>
    platform === 'win32'
      ? `'${value.replaceAll("'", "''")}'`
      : `'${value.replaceAll("'", "'\\''")}'`
  return `${platform === 'win32' ? '& ' : ''}${[executable, relay].map(quote).join(' ')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

// Gemini settings accept JSONC. Strip comments/trailing commas only outside strings;
// user policy must not disappear merely because a comment was present.
function parseSettings(source: string): Record<string, unknown> {
  let json = ''
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!
    if (character === '"') {
      json += character
      while (++index < source.length) {
        json += source[index]
        if (source[index] === '\\') json += source[++index]
        else if (source[index] === '"') break
      }
    } else if (character === '/' && source[index + 1] === '/') {
      while (index + 1 < source.length && source[index + 1] !== '\n') index++
    } else if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      if (end < 0) throw new Error('Unclosed Gemini settings comment.')
      index = end + 1
      json += ' '
    } else json += character
  }
  let normalized = ''
  let inString = false
  for (let index = 0; index < json.length; index++) {
    const character = json[index]!
    if (inString && character === '\\') {
      normalized += character + json[++index]
      continue
    }
    if (character === '"') inString = !inString
    if (!inString && character === ',' && /^\s*[}\]]/.test(json.slice(index + 1))) continue
    normalized += character
  }
  const value: unknown = JSON.parse(normalized)
  if (!isRecord(value)) throw new Error('Gemini system settings must be an object.')
  return value
}
