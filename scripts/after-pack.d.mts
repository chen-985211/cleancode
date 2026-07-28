export interface AfterPackContext {
  readonly appOutDir: string
  readonly arch: number
  readonly electronPlatformName: string
  readonly packager: {
    readonly projectDir: string
  }
}

export default function afterPack(context: AfterPackContext): Promise<void>
