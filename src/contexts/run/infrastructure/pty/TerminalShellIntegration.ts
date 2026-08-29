import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type { TerminalLaunchMode } from '../../application/ports/TerminalProcessPort'

export interface TerminalShellIntegrationFiles {
  readonly bashInitFile: string
  readonly fishInitFile: string
  readonly zshDotDirectory: string
}

export interface TerminalShellIntegrationDecoration {
  readonly environment: Readonly<Record<string, string>>
  readonly interactiveShellArguments: readonly string[]
}

export async function installTerminalShellIntegration(
  rootDirectory: string
): Promise<TerminalShellIntegrationFiles> {
  const zshDotDirectory = join(rootDirectory, 'zsh')
  const files = {
    bashInitFile: join(rootDirectory, 'bash.sh'),
    fishInitFile: join(rootDirectory, 'fish.fish'),
    zshDotDirectory
  }
  await Promise.all([
    mkdir(rootDirectory, { mode: 0o700, recursive: true }),
    mkdir(zshDotDirectory, { mode: 0o700, recursive: true })
  ])
  await Promise.all([
    writePrivateFile(files.bashInitFile, bashIntegrationScript),
    writePrivateFile(files.fishInitFile, fishIntegrationScript),
    writePrivateFile(join(zshDotDirectory, '.zshenv'), zshEnvironmentScript),
    writePrivateFile(join(zshDotDirectory, '.zprofile'), zshProfileScript),
    writePrivateFile(join(zshDotDirectory, '.zshrc'), zshRcScript),
    writePrivateFile(join(zshDotDirectory, '.zlogin'), zshLoginScript)
  ])
  await Promise.all([chmod(rootDirectory, 0o700), chmod(zshDotDirectory, 0o700)])
  return files
}

export function decorateTerminalShellIntegration(input: {
  readonly environment: Readonly<Record<string, string>>
  readonly files: TerminalShellIntegrationFiles
  readonly hasLaunchCommand: boolean
  readonly launchMode: TerminalLaunchMode
  readonly platform: NodeJS.Platform
  readonly shell: string
}): TerminalShellIntegrationDecoration {
  const unchanged = { environment: {}, interactiveShellArguments: [] } as const
  if (input.platform === 'win32') return unchanged
  if (input.hasLaunchCommand && input.launchMode !== 'interactive') return unchanged

  const shellName = basename(input.shell).toLowerCase()
  if (shellName === 'zsh') {
    const userZdotDirectory = input.environment.ZDOTDIR ?? input.environment.HOME
    if (!userZdotDirectory) return unchanged
    return {
      environment: {
        CLEANCODE_USER_ZDOTDIR: userZdotDirectory,
        ZDOTDIR: input.files.zshDotDirectory
      },
      interactiveShellArguments: []
    }
  }
  if (shellName === 'bash') {
    return {
      environment: {},
      interactiveShellArguments: ['--init-file', input.files.bashInitFile]
    }
  }
  if (shellName === 'fish') {
    return {
      environment: {},
      interactiveShellArguments: [
        '--init-command',
        `source ${quoteShellWord(input.files.fishInitFile)}`
      ]
    }
  }
  return unchanged
}

async function writePrivateFile(path: string, contents: string): Promise<void> {
  await writeFile(path, `${contents.trim()}\n`, { encoding: 'utf8', mode: 0o600 })
  await chmod(path, 0o600)
}

function quoteShellWord(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

const zshEnvironmentScript = `
if [[ -n "$CLEANCODE_USER_ZDOTDIR" && "$CLEANCODE_USER_ZDOTDIR" != "$ZDOTDIR" ]]; then
  __cleancode_integration_zdotdir="$ZDOTDIR"
  ZDOTDIR="$CLEANCODE_USER_ZDOTDIR"
  if [[ -r "$ZDOTDIR/.zshenv" ]]; then
    source "$ZDOTDIR/.zshenv"
  fi
  CLEANCODE_USER_ZDOTDIR="$ZDOTDIR"
  ZDOTDIR="$__cleancode_integration_zdotdir"
  unset __cleancode_integration_zdotdir
fi
`

const zshProfileScript = `
if [[ -n "$CLEANCODE_USER_ZDOTDIR" && -r "$CLEANCODE_USER_ZDOTDIR/.zprofile" ]]; then
  __cleancode_integration_zdotdir="$ZDOTDIR"
  ZDOTDIR="$CLEANCODE_USER_ZDOTDIR"
  source "$ZDOTDIR/.zprofile"
  CLEANCODE_USER_ZDOTDIR="$ZDOTDIR"
  ZDOTDIR="$__cleancode_integration_zdotdir"
  unset __cleancode_integration_zdotdir
fi
`

const zshRcScript = `
if [[ -n "$CLEANCODE_USER_ZDOTDIR" && -r "$CLEANCODE_USER_ZDOTDIR/.zshrc" ]]; then
  __cleancode_integration_zdotdir="$ZDOTDIR"
  ZDOTDIR="$CLEANCODE_USER_ZDOTDIR"
  source "$CLEANCODE_USER_ZDOTDIR/.zshrc"
  CLEANCODE_USER_ZDOTDIR="$ZDOTDIR"
  ZDOTDIR="$__cleancode_integration_zdotdir"
  unset __cleancode_integration_zdotdir
fi

autoload -Uz add-zsh-hook
function __cleancode_urlencode() {
  emulate -L zsh
  local LC_ALL=C value="$1" encoded="" character byte index
  for (( index = 1; index <= \${#value}; index++ )); do
    character="\${value[index]}"
    if [[ "$character" == [a-zA-Z0-9/._~-] ]]; then
      encoded+="$character"
    else
      builtin printf -v byte '%%%02X' "'$character"
      encoded+="$byte"
    fi
  done
  builtin print -rn -- "$encoded"
}
function __cleancode_report_cwd() {
  builtin printf '\\e]7;file://localhost%s\\a' "$(__cleancode_urlencode "$PWD")"
}
add-zsh-hook precmd __cleancode_report_cwd
ZDOTDIR="$CLEANCODE_USER_ZDOTDIR"
unset CLEANCODE_USER_ZDOTDIR
`

const zshLoginScript = `
if [[ -n "$CLEANCODE_USER_ZDOTDIR" ]]; then
  ZDOTDIR="$CLEANCODE_USER_ZDOTDIR"
  unset CLEANCODE_USER_ZDOTDIR
  if [[ -r "$ZDOTDIR/.zlogin" ]]; then
    source "$ZDOTDIR/.zlogin"
  fi
fi
`

const bashIntegrationScript = `
if [[ -r "$HOME/.bashrc" ]]; then
  source "$HOME/.bashrc"
fi

__cleancode_urlencode() {
  local LC_ALL=C value="$1" encoded="" character byte index
  for (( index = 0; index < \${#value}; index++ )); do
    character="\${value:index:1}"
    case "$character" in
      [a-zA-Z0-9/._~-]) encoded+="$character" ;;
      *) printf -v byte '%%%02X' "'$character"; encoded+="$byte" ;;
    esac
  done
  printf '%s' "$encoded"
}
__cleancode_report_cwd() {
  printf '\\e]7;file://localhost%s\\a' "$(__cleancode_urlencode "$PWD")"
}
if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
  PROMPT_COMMAND=(__cleancode_report_cwd "\${PROMPT_COMMAND[@]}")
else
  case ";\${PROMPT_COMMAND:-};" in
    *';__cleancode_report_cwd;'*) ;;
    *) PROMPT_COMMAND="__cleancode_report_cwd\${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
  esac
fi
`

const fishIntegrationScript = `
functions --erase __cleancode_report_cwd 2>/dev/null
function __cleancode_report_cwd --on-event fish_prompt
  set --local encoded (string escape --style=url -- "$PWD")
  builtin printf '\\e]7;file://localhost%s\\a' "$encoded"
end
`
