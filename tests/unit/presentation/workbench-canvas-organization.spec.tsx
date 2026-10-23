import { act, fireEvent, renderHook } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'

import { createGraph } from '../../fixtures/presentation/workbenchCanvasContextMenuGraph'
import { defaultApplicationShortcutBindings } from '../../../src/presentation/app-shell/app-features/shortcuts/applicationShortcuts'
import { useApplicationShortcuts } from '../../../src/presentation/app-shell/app-features/shortcuts/useApplicationShortcuts'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { useWorkbenchCanvasOrganization } from '../../../src/presentation/app-shell/workbench/viewport/useWorkbenchCanvasOrganization'

type OrganizationInput = Parameters<typeof useWorkbenchCanvasOrganization>[0]

describe('workbench canvas organization shortcuts', () => {
  it.each(['mac', 'other'] as const)(
    'uses the %s binding once with a separate shell shortcut owner',
    async (platform) => {
      const input = createInput({ shortcutPlatform: platform })
      const openSettings = vi.fn()
      renderHook(() => {
        useApplicationShortcuts({
          actions: { openSettings: { enabled: true, run: openSettings } },
          bindings: defaultApplicationShortcutBindings,
          platform
        })
        return useWorkbenchCanvasOrganization(input)
      })
      await act(async () => {
        fireEvent.keyDown(document, { key: 'f', shiftKey: true, ...primaryModifier(platform) })
        fireEvent.keyDown(document, {
          key: 'f',
          shiftKey: true,
          repeat: true,
          ...primaryModifier(platform)
        })
      })
      expect(input.onOrganizeCanvas).toHaveBeenCalledExactlyOnceWith(input.items)
      expect(openSettings).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['empty canvas', { items: [] }],
    ['pending arrangement', { isCanvasArrangementPending: true }],
    ['group selection', { isTerminalGroupSelectionMode: true }],
    ['group editing', { editingTerminalGroupId: 'group' }],
    [
      'template placement',
      { placementTemplate: {} as NonNullable<OrganizationInput['placementTemplate']> }
    ],
    ['no handler', { onOrganizeCanvas: undefined }],
    ['no workbench', { currentWorkbench: null }],
    ['browser preview', { isDesktopRuntime: false }]
  ] satisfies readonly (readonly [string, Partial<OrganizationInput>])[])(
    'shares the disabled state for menu and shortcut during %s',
    async (_, overrides) => {
      const input = createInput(overrides)
      const hook = renderHook(() => useWorkbenchCanvasOrganization(input))
      expect(hook.result.current.canOrganizeCanvas).toBe(false)
      await act(async () =>
        fireEvent.keyDown(document, { key: 'f', metaKey: true, shiftKey: true })
      )
      expect(input.onUserAction).not.toHaveBeenCalled()
      if (input.onOrganizeCanvas) expect(input.onOrganizeCanvas).not.toHaveBeenCalled()
    }
  )

  it.each(['input', 'textarea', 'contenteditable', 'xterm', 'recorder', 'modal'])(
    'protects %s input from the organization shortcut',
    async (scope) => {
      const input = createInput()
      const hook = renderHook(() => useWorkbenchCanvasOrganization(input))
      const target = document.createElement(
        scope === 'input' || scope === 'textarea' ? scope : 'div'
      )
      if (scope === 'contenteditable') target.setAttribute('contenteditable', 'true')
      if (scope === 'xterm') target.className = 'xterm'
      if (scope === 'recorder') target.setAttribute('data-shortcut-capture', '')
      if (scope === 'modal') {
        target.setAttribute('role', 'dialog')
        target.setAttribute('aria-modal', 'true')
      }
      document.body.append(target)
      try {
        await act(async () =>
          fireEvent.keyDown(target, { key: 'f', metaKey: true, shiftKey: true })
        )
        expect(input.onOrganizeCanvas).not.toHaveBeenCalled()
      } finally {
        hook.unmount()
        target.remove()
      }
    }
  )

  it('tracks customized and cleared bindings and removes its listener on unmount', async () => {
    const input = createInput()
    const hook = renderHook((props: OrganizationInput) => useWorkbenchCanvasOrganization(props), {
      initialProps: input
    })
    const custom = { alt: true, key: 'K', primary: false, shift: false }
    hook.rerender({
      ...input,
      shortcutBindings: { ...defaultApplicationShortcutBindings, organizeCanvas: custom }
    })
    await act(async () => {
      fireEvent.keyDown(document, { key: 'f', metaKey: true, shiftKey: true })
      fireEvent.keyDown(document, { key: 'k', altKey: true })
    })
    expect(input.onOrganizeCanvas).toHaveBeenCalledOnce()
    hook.rerender({
      ...input,
      shortcutBindings: { ...defaultApplicationShortcutBindings, organizeCanvas: null }
    })
    await act(async () => fireEvent.keyDown(document, { key: 'k', altKey: true }))
    expect(input.onOrganizeCanvas).toHaveBeenCalledOnce()
    hook.rerender(input)
    hook.unmount()
    await act(async () => fireEvent.keyDown(document, { key: 'f', metaKey: true, shiftKey: true }))
    expect(input.onOrganizeCanvas).toHaveBeenCalledOnce()
  })
})

function primaryModifier(platform: 'mac' | 'other') {
  return platform === 'mac' ? { metaKey: true } : { ctrlKey: true }
}

function createInput(overrides: Partial<OrganizationInput> = {}): OrganizationInput {
  return {
    currentWorkbench: {
      graph: createGraph(),
      gitBranches: [],
      project: { id: 'project', directory: '/repo', name: 'Project', workspaces: [] }
    },
    currentWorkspace: undefined,
    isDesktopRuntime: true,
    isTerminalGroupSelectionMode: false,
    onOrganizeCanvas: vi.fn(async () => null),
    onUserAction: vi.fn(),
    onFailure: vi.fn(),
    reactFlowInstanceRef: {
      current: { getViewport: () => ({ x: 0, y: 0, zoom: 1 }) } as ReactFlowInstance<
        WorkbenchFlowNode,
        Edge
      >
    },
    items: [
      {
        key: 'agent:a',
        nodeIds: ['agent:a'],
        reference: { kind: 'agent', agentId: 'a' },
        position: { x: 0, y: 0 },
        size: { width: 720, height: 460 }
      }
    ],
    ...overrides
  }
}
