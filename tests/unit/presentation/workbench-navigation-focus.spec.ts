import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'

import type { TerminalBlockSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkspaceAgentSnapshot } from '../../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { focusTerminalBlockInCanvas } from '../../../src/presentation/app-shell/workbench/viewport/focusTerminalBlockInCanvas'
import { focusAgentConsoleInCanvas } from '../../../src/presentation/app-shell/workbench/viewport/focusAgentConsoleInCanvas'
import {
  cancelWorkbenchViewportMotion,
  setWorkbenchViewportReducedMotion,
  transitionWorkbenchViewport
} from '../../../src/presentation/app-shell/workbench/viewport/workbenchViewportMotion'
import { motionPreferenceStore } from '../../../src/presentation/shared/motion/motionPreference'

describe.each(['terminal', 'agent'] as const)('default %s navigation focus', (kind) => {
  beforeEach(() => {
    vi.spyOn(motionPreferenceStore, 'getSnapshot').mockReturnValue(true)
    const canvas = document.createElement('div')
    canvas.className = 'react-flow'
    Object.defineProperties(canvas, {
      clientWidth: { value: 1000 },
      clientHeight: { value: 800 }
    })
    document.body.append(canvas)
  })
  afterEach(() => {
    cancelWorkbenchViewportMotion()
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it.each([
    { zoom: 1.4, width: 240, height: 100, expectedZoom: 1.4 },
    { zoom: 0.96, width: 240, height: 100, expectedZoom: 0.96 },
    { zoom: 0.5, width: 240, height: 100, expectedZoom: 1 },
    { zoom: 1.4, width: 1600, height: 1000, expectedZoom: 0.45 }
  ])('preserves readable zoom and fits oversized nodes: $zoom / $width', (scenario) => {
    const { instance, setViewport } = createInstance(scenario.zoom)
    focus(kind, instance, scenario)
    const viewport = setViewport.mock.calls[0]![0]
    expect(viewport.zoom).toBeCloseTo(scenario.expectedZoom, 6)
    expect(viewport.x + (1700 + scenario.width / 2) * viewport.zoom).toBeCloseTo(500)
    expect(viewport.y + (600 + scenario.height / 2) * viewport.zoom).toBeCloseTo(400)
    expect(scenario.width * viewport.zoom).toBeLessThanOrEqual(1000)
    expect(scenario.height * viewport.zoom).toBeLessThanOrEqual(800)
  })

  it('inherits the pending target zoom when another focus is still flying', () => {
    vi.spyOn(motionPreferenceStore, 'getSnapshot').mockReturnValue(false)
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const { instance, setViewport } = createInstance(0.8)
    void transitionWorkbenchViewport(instance, {
      type: 'center',
      center: { x: 2000, y: 700 },
      zoom: 1.4,
      intent: { type: 'adaptive-focus', canvasSize: { width: 1000, height: 800 } }
    })
    focus(kind, instance, { width: 240, height: 100 })
    setWorkbenchViewportReducedMotion(true, instance)
    expect(setViewport).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 1.4 }), {
      duration: 0
    })
  })

  it('preserves an explicitly supplied focus zoom', () => {
    const { instance, setViewport } = createInstance(0.5)
    focus(kind, instance, { width: 240, height: 100 }, 1.2)
    expect(setViewport).toHaveBeenCalledWith(expect.objectContaining({ zoom: 1.2 }), {
      duration: 0
    })
  })
})

function createInstance(zoom: number) {
  const setViewport = vi.fn<
    (viewport: Viewport, options: { duration: number }) => Promise<boolean>
  >(async () => true)
  return {
    setViewport,
    instance: {
      getNode: () => undefined,
      getViewport: () => ({ x: 0, y: 0, zoom }),
      setViewport
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
  }
}

function focus(
  kind: 'terminal' | 'agent',
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  size: { width: number; height: number },
  targetZoom?: number
) {
  const position = { x: 1700, y: 600 }
  const selection = {
    setSelectedAgentId: vi.fn(),
    setSelectedTerminalBlockIds: vi.fn(),
    setSelectedTerminalBlockId: vi.fn(),
    setSelectedTerminalGroupId: vi.fn(),
    setHoveredTerminalBlockId: vi.fn()
  }
  if (kind === 'terminal')
    focusTerminalBlockInCanvas({
      ...selection,
      reactFlowInstance: instance,
      activateTerminalInput: false,
      targetZoom,
      block: { id: 'terminal-1', position, size } as TerminalBlockSnapshot
    })
  else
    focusAgentConsoleInCanvas({
      ...selection,
      reactFlowInstance: instance,
      activateAgentInput: false,
      targetZoom,
      agent: { agentId: 'agent-1', layout: { position, size } } as WorkspaceAgentSnapshot
    })
}
