import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import { AgentCreateSplitButton } from '../../../src/presentation/app-shell/workbench/creation/AgentCreateSplitButton'
import { CanvasMenuMotionProvider } from '../../../src/presentation/app-shell/workbench/menus/CanvasMenuMotionProvider'
import type { CreatableAgentProviderSnapshot } from '../../../src/contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import type { AgentProviderDescriptor } from '../../../src/contexts/agent/application/ports/AgentProviderContribution'

const providers = [
  createProvider('codex', 'Codex', 'codex-cli 9.9.9'),
  createProvider('claude-code', 'Claude Code', '2.1.0')
] as const

describe('Agent create split button', () => {
  it('creates immediately from the main segment and the selected Provider menu item', () => {
    const onCreate = vi.fn()
    const onSelectDefault = vi.fn()

    renderAgentCreate(
      <AgentCreateSplitButton
        defaultProviderId="codex"
        disabled={false}
        isCreating={false}
        providers={providers}
        shortcutTooltip="新建 Agent (⌘⇧A)"
        onCreate={onCreate}
        onOpenAgentSettings={vi.fn()}
        onSelectDefault={onSelectDefault}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '新建 Agent' }))
    expect(onCreate).toHaveBeenCalledOnce()
    expect(onSelectDefault).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '选择默认 Agent' }))
    const codex = screen.getByRole('menuitemradio', { name: 'Codex' })
    const claude = screen.getByRole('menuitemradio', { name: 'Claude Code' })
    expect(codex).toHaveAttribute('aria-checked', 'true')
    expect(claude).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByText('codex-cli 9.9.9')).not.toBeInTheDocument()
    expect(screen.queryByText('2.1.0')).not.toBeInTheDocument()

    fireEvent.click(claude)
    expect(onSelectDefault).toHaveBeenCalledWith('claude-code')
    expect(onCreate.mock.calls).toEqual([[], ['claude-code']])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('supports roving keyboard focus and restores focus when the menu closes', () => {
    const onCreate = vi.fn()
    const onSelectDefault = vi.fn()
    renderAgentCreate(
      <AgentCreateSplitButton
        defaultProviderId="codex"
        disabled={false}
        isCreating={false}
        providers={providers}
        shortcutTooltip="新建 Agent (⌘⇧A)"
        onCreate={onCreate}
        onOpenAgentSettings={vi.fn()}
        onSelectDefault={onSelectDefault}
      />
    )

    const trigger = screen.getByRole('button', { name: '选择默认 Agent' })
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    const codex = screen.getByRole('menuitemradio', { name: 'Codex' })
    const claude = screen.getByRole('menuitemradio', { name: 'Claude Code' })

    expect(menu).toHaveFocus()
    expect(codex).not.toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(codex).toHaveFocus()

    fireEvent.keyDown(codex, { key: 'ArrowDown' })
    expect(claude).toHaveFocus()
    fireEvent.keyDown(claude, { key: 'Enter' })

    expect(onSelectDefault).toHaveBeenCalledWith('claude-code')
    expect(onCreate).toHaveBeenCalledExactlyOnceWith('claude-code')
    expect(trigger).toHaveFocus()
  })

  it('moves one menu highlight between pointer and keyboard targets', () => {
    renderAgentCreate(
      <AgentCreateSplitButton
        defaultProviderId="codex"
        disabled={false}
        isCreating={false}
        providers={providers}
        shortcutTooltip="新建 Agent (⌘⇧A)"
        onCreate={vi.fn()}
        onOpenAgentSettings={vi.fn()}
        onSelectDefault={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '选择默认 Agent' }))
    const menu = screen.getByRole('menu')
    const claude = screen.getByRole('menuitemradio', { name: 'Claude Code' })
    const settings = screen.getByRole('menuitem', { name: 'Agent 设置…' })
    const highlight = menu.querySelector<HTMLElement>('.agent-create-menu__highlight')

    expect(highlight).not.toBeNull()
    expect(highlight).not.toHaveAttribute('data-visible')
    expect(highlight).not.toHaveAttribute('data-target-y')
    setMenuItemGeometry(claude, 43)
    setMenuItemGeometry(settings, 96)

    fireEvent.pointerEnter(claude)
    expect(highlight).toHaveAttribute('data-visible', 'true')
    expect(highlight).toHaveAttribute('data-target-y', '43')

    fireEvent.pointerLeave(menu)
    expect(highlight).not.toHaveAttribute('data-visible')
    expect(highlight).not.toHaveAttribute('data-target-y')
    expect(highlight?.style.getPropertyValue('--cc-agent-create-menu-highlight-y')).toBe('43px')

    settings.focus()
    expect(highlight).toHaveAttribute('data-visible', 'true')
    expect(highlight).toHaveAttribute('data-target-y', '96')
  })

  it('opens Agent settings from the main segment when no Provider is available', () => {
    const onOpenAgentSettings = vi.fn()
    renderAgentCreate(
      <AgentCreateSplitButton
        defaultProviderId={null}
        disabled={false}
        isCreating={false}
        providers={[]}
        shortcutTooltip="新建 Agent (⌘⇧A)"
        onCreate={vi.fn()}
        onOpenAgentSettings={onOpenAgentSettings}
        onSelectDefault={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '新建 Agent' }))
    expect(onOpenAgentSettings).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '选择默认 Agent' }))
    expect(screen.getByText('没有可用的 Agent')).toBeVisible()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Agent 设置…' }))
    expect(onOpenAgentSettings).toHaveBeenCalledTimes(2)
  })

  it('uses a proportioned flush high-radius group with one interaction surface', () => {
    const { container } = renderAgentCreate(
      <AgentCreateSplitButton
        defaultProviderId="codex"
        disabled={false}
        isCreating={false}
        providers={providers}
        shortcutTooltip="新建 Agent (⌘⇧A)"
        onCreate={vi.fn()}
        onOpenAgentSettings={vi.fn()}
        onSelectDefault={vi.fn()}
      />
    )
    const styles = readFileSync(
      resolve(process.cwd(), 'src/presentation/app-shell/workbench/creation/agent-create.css'),
      'utf8'
    )
    const workbenchStyles = readFileSync(
      resolve(process.cwd(), 'src/presentation/app-shell/workbench/workbench-canvas.css'),
      'utf8'
    )
    const themeStyles = readFileSync(
      resolve(process.cwd(), 'src/presentation/app-shell/styles/theme.css'),
      'utf8'
    )
    const buttonRule = styles.split('.agent-create-split .toolbar-button {')[1]?.split('}')[0] ?? ''
    const splitRule = styles.split('.agent-create-split {')[1]?.split('}')[0] ?? ''
    const mainRule = styles.split('.agent-create-split__main {')[1]?.split('}')[0] ?? ''
    const triggerRule = styles.split('.agent-create-split__trigger {')[1]?.split('}')[0] ?? ''
    const hoverRule =
      styles.split(".agent-create-split[data-disabled='false']:hover {")[1]?.split('}')[0] ?? ''
    const hoveredButtonRule =
      styles
        .split(
          ".agent-create-split[data-disabled='false']:hover .toolbar-button:not(:disabled) {"
        )[1]
        ?.split('}')[0] ?? ''
    const menuItemInteractionRule =
      styles
        .split('.agent-create-menu__item:hover,\n.agent-create-menu__item:focus-visible {')[1]
        ?.split('}')[0] ?? ''
    const menuHighlightRule =
      styles.split('.agent-create-menu__highlight {')[1]?.split('}')[0] ?? ''
    const activeButtonRule =
      styles
        .split('.agent-create-split .toolbar-button:active:not(:disabled) {')[1]
        ?.split('}')[0] ?? ''
    const agentToolbarGroupRule =
      workbenchStyles.split('.app-shell__toolbar-group--agent {')[1]?.split('}')[0] ?? ''

    expect(container.querySelector('.agent-create-split')).toHaveAttribute('data-disabled', 'false')
    expect(agentToolbarGroupRule).toContain('padding: 0;')
    expect(agentToolbarGroupRule).toContain('border-radius: 999px;')
    expect(splitRule).toContain('border-radius: 999px;')
    expect(themeStyles).toContain('--cc-agent-create-surface: rgb(246 246 247);')
    expect(themeStyles).toContain('--cc-agent-create-hover: rgb(226 226 228);')
    expect(buttonRule).toContain('border-color: transparent;')
    expect(buttonRule).toContain('background: transparent;')
    expect(buttonRule).toContain('height: 38px;')
    expect(mainRule).toContain('padding: 0 14px;')
    expect(triggerRule).toContain('width: 38px;')
    expect(hoverRule).toContain('background: var(--cc-agent-create-hover);')
    expect(hoveredButtonRule).toContain('background: transparent;')
    expect(menuItemInteractionRule).toContain('background: transparent;')
    expect(menuHighlightRule).toContain('background: var(--cc-agent-create-hover);')
    expect(menuHighlightRule).toContain(
      'transform: translate3d(0, var(--cc-agent-create-menu-highlight-y, 0px), 0);'
    )
    expect(activeButtonRule).toContain('transform: none;')
  })
})

function renderAgentCreate(node: ReactNode) {
  return render(<CanvasMenuMotionProvider reducedMotion>{node}</CanvasMenuMotionProvider>)
}

function setMenuItemGeometry(item: HTMLElement, offsetTop: number): void {
  Object.defineProperties(item, {
    offsetHeight: { configurable: true, value: 38 },
    offsetTop: { configurable: true, value: offsetTop }
  })
}

function createProvider(
  id: string,
  displayName: string,
  version: string
): CreatableAgentProviderSnapshot {
  const descriptor: AgentProviderDescriptor = {
    capabilities: {
      activityTracking: false,
      cleancodeMcp: false,
      launchInstructions: false,
      resume: false,
      sessionIdentityCapture: false,
      sessionRefCodec: false
    },
    displayName,
    icon: {
      paths: [{ d: `M2 2h20v20H2z M${id.length} 4v16` }],
      viewBox: '0 0 24 24'
    },
    id
  }
  return {
    availability: {
      providerId: id,
      status: 'installed',
      version
    },
    descriptor
  }
}
