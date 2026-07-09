export const codexCliInstallCommand = 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'

export type CodexCliInstallationSnapshot =
  | {
      readonly status: 'installed'
      readonly version: string
      readonly installCommand: string
    }
  | {
      readonly status: 'missing'
      readonly version: null
      readonly installCommand: string
    }

export interface CodexCliPort {
  inspect(): Promise<CodexCliInstallationSnapshot>
}
