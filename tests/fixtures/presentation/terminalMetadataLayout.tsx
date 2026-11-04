import '@xyflow/react/dist/style.css'
import '../../../src/presentation/app-shell/shell/AppShell.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ReactFlow } from '@xyflow/react'
import { TerminalNode } from '../../../src/presentation/app-shell/workbench/nodes/terminal/TerminalNode'
import { CanvasMenuMotionProvider } from '../../../src/presentation/app-shell/workbench/menus/CanvasMenuMotionProvider'
import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types/terminalFlowNode'
import type { TerminalBlockSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'

import { WorkbenchToolbar } from '../../../src/presentation/app-shell/workbench/toolbar/WorkbenchToolbar'

const nodeTypes = { terminal: TerminalNode }
const noop = () => undefined
const root = document.getElementById('root')!
root.style.width = '100vw'
root.style.height = '100vh'
root.style.position = 'relative'
document.body.style.margin = '0'
document.documentElement.dataset.theme =
  new URLSearchParams(location.search).get('theme') ?? 'light'

// This standalone Electron entry owns its root; Vite HMR is disabled by the test.
// eslint-disable-next-line react-refresh/only-export-components
function Fixture() {
  const [block, setBlock] = useState<TerminalBlockSnapshot>({
    id: 'terminal-1',
    type: 'terminal',
    name: 'Terminal 1',
    description: '',
    launchCommand: '',
    position: { x: 240, y: window.innerHeight - 200 },
    size: { width: 720, height: 360 }
  })
  const data: TerminalFlowNode['data'] = {
    identity: {
      projectId: 'fixture',
      workspaceId: 'main',
      objectKind: 'terminal',
      objectId: block.id
    },
    block,
    session: { sessionId: null, status: 'idle', output: '' },
    isSelected: false,
    isTerminalGroupSelectionMode: false,
    canSelectForTerminalGroup: true,
    isNavigationHighlighted: false,
    onStart: noop,
    onStop: noop,
    onQuickLaunch: noop,
    onRestart: noop,
    onDelete: noop,
    onUpdateDefinition: async (_block, definition) => {
      setBlock((current) => ({ ...current, ...definition }))
    },
    onInput: noop,
    onResize: noop,
    onResizeBlock: async () => undefined,
    onSelect: noop,
    onToggleTerminalGroupCandidate: noop
  }
  const nodes: TerminalFlowNode[] = [
    { id: block.id, type: 'terminal', position: block.position, style: block.size, data }
  ]
  return (
    <I18nProvider initialLocale="zh-CN">
      <CanvasMenuMotionProvider
        reducedMotion={matchMedia('(prefers-reduced-motion: reduce)').matches}
      >
        <WorkbenchToolbar
          isDesktopRuntime={false}
          hasWorkbench={true}
          isTerminalGroupSelectionMode={false}
          selectedTerminalGroupCandidateCount={0}
          shortcutTooltips={{ createAgent: 'Create Agent' }}
          onCreateWorkspaceAgent={noop}
          onCancelTerminalGroupSelection={noop}
        />
        <ReactFlow
          nodes={nodes}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          zoomOnScroll={false}
          panOnDrag={false}
        />
      </CanvasMenuMotionProvider>
    </I18nProvider>
  )
}

createRoot(root).render(<Fixture />)
