import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('app shell project reordering', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('adopts the authoritative reordered list without changing the current project', async () => {
    const alpha = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const beta = createWorkbenchSnapshot('/tmp/beta-project', 'beta-project')
    const gamma = createWorkbenchSnapshot('/tmp/gamma-project', 'gamma-project')
    const reorderProject = vi.fn(async () => [gamma, alpha, beta])

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [alpha, beta, gamma]),
        reorderProject
      })
    })

    render(<AppShell />)
    await screen.findByRole('button', { name: 'gamma-project' })

    const projectList = document.querySelector<HTMLElement>('.project-list')!
    const projectCards = [...document.querySelectorAll<HTMLElement>('.project-card')]
    mockRect(projectList, { top: 100, bottom: 400 })
    mockRect(projectCards[0]!, { top: 100, bottom: 180 })
    mockRect(projectCards[1]!, { top: 190, bottom: 270 })
    mockRect(projectCards[2]!, { top: 280, bottom: 360 })

    const gammaTitle = screen.getByRole('button', { name: 'gamma-project' })
    fireEvent.pointerDown(gammaTitle, { button: 0, pointerId: 1, clientX: 20, clientY: 300 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 20, clientY: 101 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 20, clientY: 101 })

    await waitFor(() => {
      expect(reorderProject).toHaveBeenCalledWith({
        projectDirectory: '/tmp/gamma-project',
        beforeProjectDirectory: '/tmp/alpha-project'
      })
    })
    await waitFor(() => {
      expect(
        [...document.querySelectorAll<HTMLElement>('.project-card__name')].map(
          (element) => element.textContent
        )
      ).toEqual(['gamma-project', 'alpha-project', 'beta-project'])
    })
    expect(
      within(screen.getByRole('group', { name: '项目 alpha-project' })).getByRole('button', {
        name: 'Git 未初始化 默认工作区'
      })
    ).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the committed order and shows a localized error when persistence fails', async () => {
    const alpha = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const beta = createWorkbenchSnapshot('/tmp/beta-project', 'beta-project')
    const reorderProject = vi.fn(async () => {
      throw new Error('disk unavailable')
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [alpha, beta]),
        reorderProject
      })
    })

    render(<AppShell />)
    await screen.findByRole('button', { name: 'beta-project' })

    const projectList = document.querySelector<HTMLElement>('.project-list')!
    const projectCards = [...document.querySelectorAll<HTMLElement>('.project-card')]
    mockRect(projectList, { top: 100, bottom: 300 })
    mockRect(projectCards[0]!, { top: 100, bottom: 180 })
    mockRect(projectCards[1]!, { top: 190, bottom: 270 })

    const betaTitle = screen.getByRole('button', { name: 'beta-project' })
    fireEvent.pointerDown(betaTitle, { button: 0, pointerId: 2, clientX: 20, clientY: 210 })
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 20, clientY: 101 })
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 20, clientY: 101 })

    expect(await screen.findByRole('alert')).toHaveTextContent('项目排序失败，请重试。')
    expect(
      [...document.querySelectorAll<HTMLElement>('.project-card__name')].map(
        (element) => element.textContent
      )
    ).toEqual(['alpha-project', 'beta-project'])
  })
})

function mockRect(element: HTMLElement, input: { readonly top: number; readonly bottom: number }) {
  element.getBoundingClientRect = vi.fn(() => ({
    bottom: input.bottom,
    height: input.bottom - input.top,
    left: 0,
    right: 240,
    top: input.top,
    width: 240,
    x: 0,
    y: input.top,
    toJSON: () => ({})
  }))
}
