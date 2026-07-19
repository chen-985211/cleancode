export const codexCliInstallCommand = 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'

type CodexCliInspectionFailureReason =
  'command_failed' | 'invalid_output' | 'permission_denied' | 'timed_out'

export type CodexCliInstallationSnapshot =
  | {
      readonly status: 'installed'
      readonly version: string
    }
  | {
      readonly installCommand: string
      readonly reason: 'not_found'
      readonly status: 'missing'
      readonly version: null
    }
  | {
      readonly reason: CodexCliInspectionFailureReason
      readonly status: 'temporarily_unavailable'
      readonly version: null
    }

export interface CodexCliPort {
  inspect(): Promise<CodexCliInstallationSnapshot>
}
