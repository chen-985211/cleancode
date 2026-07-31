import { createApplicationShortcutTooltipLabels } from '../../../src/presentation/app-shell/applicationShortcutTooltips'
import {
  defaultApplicationShortcutBindings,
  type ApplicationShortcutBindings
} from '../../../src/presentation/app-shell/applicationShortcuts'
import { translate } from '../../../src/presentation/app-shell/i18n/messages'

describe('application shortcut tooltips', () => {
  it('formats every default binding for the active platform', () => {
    const macLabels = createApplicationShortcutTooltipLabels(
      defaultApplicationShortcutBindings,
      'mac',
      (key, variables) => translate('zh-CN', key, variables)
    )
    const otherLabels = createApplicationShortcutTooltipLabels(
      defaultApplicationShortcutBindings,
      'other',
      (key, variables) => translate('en', key, variables)
    )

    expect(macLabels).toEqual({
      openSettings: '打开设置 (⌘,)',
      toggleSidebar: '切换侧边栏 (⌘B)',
      addProject: '添加项目 (⌘O)',
      createBranchWorkspace: '新建分支工作区 (⌘N)',
      previousWorkspace: '上一个工作区 (⌘⇧↑)',
      nextWorkspace: '下一个工作区 (⌘⇧↓)',
      createTerminal: '新建终端积木 (⌘T)',
      createAgent: '新建 Agent (⌘⇧A)',
      groupTerminals: '组合终端 (⌘G)',
      zoomCanvasIn: '放大画布 (⌘])',
      zoomCanvasOut: '缩小画布 (⌘[)',
      fitCanvas: '适应画布 (⌘\\)',
      selectCanvasNodeLeft: '选择左侧节点 (⌘←)',
      selectCanvasNodeRight: '选择右侧节点 (⌘→)',
      selectCanvasNodeUp: '选择上方节点 (⌘↑)',
      selectCanvasNodeDown: '选择下方节点 (⌘↓)',
      toggleMinimap: '收起或展开小地图 (⌘⇧M)',
      quickExecution1: '执行快捷位 1 (⌘1)',
      quickExecution2: '执行快捷位 2 (⌘2)',
      quickExecution3: '执行快捷位 3 (⌘3)',
      quickExecution4: '执行快捷位 4 (⌘4)',
      quickExecution5: '执行快捷位 5 (⌘5)'
    })
    expect(otherLabels.createAgent).toBe('New Agent (Ctrl+Shift+A)')
    expect(otherLabels.createTerminal).toBe('New terminal block (Ctrl+T)')
  })

  it('tracks custom bindings and omits empty shortcut parentheses', () => {
    const bindings: ApplicationShortcutBindings = {
      ...defaultApplicationShortcutBindings,
      toggleSidebar: { alt: true, key: 'K', primary: true, shift: true },
      groupTerminals: null
    }

    const labels = createApplicationShortcutTooltipLabels(bindings, 'mac', (key, variables) =>
      translate('zh-CN', key, variables)
    )

    expect(labels.toggleSidebar).toBe('切换侧边栏 (⌘⌥⇧K)')
    expect(labels.groupTerminals).toBe('组合终端')
  })
})
