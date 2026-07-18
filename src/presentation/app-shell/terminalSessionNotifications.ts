import type { NotifyApp } from './appNotifications'
import { resolveUserFacingErrorMessage } from './appErrorMessages'

export function notifyTerminalLaunchFailure(notify: NotifyApp, error: unknown): void {
  notify({
    kind: 'error',
    title: '启动命令失败',
    message: resolveUserFacingErrorMessage(error, '启动命令失败，请检查终端输出后重试。')
  })
}
