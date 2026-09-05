export const zhCNApplicationDiagnosticsMessages = {
  'settings.diagnostics.title': '问题反馈',
  'settings.diagnostics.description': '导出经过脱敏的诊断信息，帮助定位使用过程中遇到的问题。',
  'settings.diagnostics.privacy': '不包含源码、终端内容或 Agent 对话。',
  'settings.diagnostics.copySummary': '复制诊断摘要',
  'settings.diagnostics.copyDescription': '复制应用、系统和近期错误概况，适合粘贴到问题描述中。',
  'settings.diagnostics.copying': '正在复制…',
  'settings.diagnostics.copied': '诊断摘要已复制。',
  'settings.diagnostics.copyFailed': '未能复制诊断摘要，请重试。',
  'settings.diagnostics.export': '导出诊断文件',
  'settings.diagnostics.exportDescription': '保存最近 30 分钟的脱敏应用日志与运行环境信息。',
  'settings.diagnostics.exporting': '正在导出…',
  'settings.diagnostics.exported': '已导出 {fileName}。',
  'settings.diagnostics.exportFailed': '未能导出诊断文件，请重试。',
  'settings.diagnostics.report': '提交问题',
  'settings.diagnostics.reportDescription': '前往 GitHub，粘贴诊断摘要或附上已导出的诊断文件。',
  'settings.diagnostics.openGitHub': '前往 GitHub',
  'settings.diagnostics.unavailable': '诊断导出仅在桌面应用中可用。',
  'settings.diagnostics.dialogTitle': '导出诊断信息',
  'settings.diagnostics.dialogButton': '导出',
  'settings.diagnostics.summaryTitle': '问题反馈诊断摘要',
  'settings.diagnostics.summaryApplication': '应用：{name} {version}',
  'settings.diagnostics.summarySystem': '系统：{platform} {architecture} ({osRelease})',
  'settings.diagnostics.summaryRuntime':
    '运行时：Electron {electronVersion} · Node {nodeVersion} · Chromium {chromiumVersion}',
  'settings.diagnostics.summaryGenerated': '生成时间：{generatedAt}',
  'settings.diagnostics.summaryWindow': '日志范围：最近 {minutes} 分钟 · {records} 条记录',
  'settings.diagnostics.summaryFailures': '最近错误',
  'settings.diagnostics.summaryNoFailures': '没有最近错误。',
  'settings.diagnostics.summaryFailure':
    '- {timestamp} · {source} · {operation} · {code} · {correlationId}',
  'settings.diagnostics.notAvailable': '不可用'
} as const

export const enApplicationDiagnosticsMessages = {
  'settings.diagnostics.title': 'Problem feedback',
  'settings.diagnostics.description':
    'Export sanitized diagnostics to help investigate problems you encountered while using the app.',
  'settings.diagnostics.privacy':
    'Source code, terminal content, and Agent conversations are not included.',
  'settings.diagnostics.copySummary': 'Copy diagnostic summary',
  'settings.diagnostics.copyDescription':
    'Copy an overview of the app, system, and recent failures into a problem report.',
  'settings.diagnostics.copying': 'Copying…',
  'settings.diagnostics.copied': 'Diagnostic summary copied.',
  'settings.diagnostics.copyFailed': 'The diagnostic summary could not be copied. Try again.',
  'settings.diagnostics.export': 'Export diagnostic file',
  'settings.diagnostics.exportDescription':
    'Save sanitized app logs and runtime details from the last 30 minutes.',
  'settings.diagnostics.exporting': 'Exporting…',
  'settings.diagnostics.exported': 'Exported {fileName}.',
  'settings.diagnostics.exportFailed': 'The diagnostic file could not be exported. Try again.',
  'settings.diagnostics.report': 'Report a problem',
  'settings.diagnostics.reportDescription':
    'Open GitHub to paste the diagnostic summary or attach the exported diagnostic file.',
  'settings.diagnostics.openGitHub': 'Open GitHub',
  'settings.diagnostics.unavailable': 'Diagnostic export is only available in the desktop app.',
  'settings.diagnostics.dialogTitle': 'Export diagnostics',
  'settings.diagnostics.dialogButton': 'Export',
  'settings.diagnostics.summaryTitle': 'Problem feedback diagnostic summary',
  'settings.diagnostics.summaryApplication': 'Application: {name} {version}',
  'settings.diagnostics.summarySystem': 'System: {platform} {architecture} ({osRelease})',
  'settings.diagnostics.summaryRuntime':
    'Runtime: Electron {electronVersion} · Node {nodeVersion} · Chromium {chromiumVersion}',
  'settings.diagnostics.summaryGenerated': 'Generated: {generatedAt}',
  'settings.diagnostics.summaryWindow': 'Log window: last {minutes} minutes · {records} records',
  'settings.diagnostics.summaryFailures': 'Recent failures',
  'settings.diagnostics.summaryNoFailures': 'No recent failures.',
  'settings.diagnostics.summaryFailure':
    '- {timestamp} · {source} · {operation} · {code} · {correlationId}',
  'settings.diagnostics.notAvailable': 'Unavailable'
} as const
