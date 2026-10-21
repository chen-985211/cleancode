import { act, cleanup, render } from '@testing-library/react'

import { ProjectSidebar } from '../../../../src/contexts/project/presentation/components/ProjectSidebar'
import { createWorkbenchSnapshot } from '../../../fixtures/presentation/appShellFixtures'

const progressProperty = '--cc-project-marker-progress'

describe('current project marker morph', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([0, 1])(
    'keeps both marker shapes continuous while project %s selection changes immediately',
    (initialIndex) => {
      const props = createProps()
      const nextIndex = 1 - initialIndex
      const { rerender } = render(
        <ProjectSidebar {...props} currentWorkbench={props.workbenches[initialIndex]} />
      )
      const previousMarker = markerFor(props.workbenches[initialIndex].project.id)
      const nextMarker = markerFor(props.workbenches[nextIndex].project.id)
      expect(progress(previousMarker)).toBe(1)
      expect(progress(nextMarker)).toBe(0)

      rerender(<ProjectSidebar {...props} currentWorkbench={props.workbenches[nextIndex]} />)
      expect(currentProjectId()).toBe(props.workbenches[nextIndex].project.id)
      expect(markerFor(props.workbenches[initialIndex].project.id)).toBe(previousMarker)
      expect(progress(previousMarker)).toBe(1)
      expect(progress(nextMarker)).toBe(0)

      act(() => vi.advanceTimersByTime(150))
      expect(progress(previousMarker)).toBeGreaterThan(0.1)
      expect(progress(previousMarker)).toBeLessThan(1)
      expect(progress(nextMarker)).toBeGreaterThan(0)
      expect(progress(nextMarker)).toBeLessThan(0.9)
      const beforeReversal = [progress(previousMarker), progress(nextMarker)]

      rerender(<ProjectSidebar {...props} currentWorkbench={props.workbenches[initialIndex]} />)
      expect(currentProjectId()).toBe(props.workbenches[initialIndex].project.id)
      expect([progress(previousMarker), progress(nextMarker)]).toEqual(beforeReversal)

      act(() => vi.advanceTimersByTime(2000))
      expect(progress(previousMarker)).toBe(1)
      expect(progress(nextMarker)).toBe(0)
      expect(props.onSelectWorkspace).not.toHaveBeenCalled()
    }
  )

  it('releases scheduled frames when the sidebar unmounts during a morph', () => {
    const props = createProps()
    const { rerender, unmount } = render(
      <ProjectSidebar {...props} currentWorkbench={props.workbenches[0]} />
    )
    rerender(<ProjectSidebar {...props} currentWorkbench={props.workbenches[1]} />)
    act(() => vi.advanceTimersByTime(64))
    expect(progress(markerFor(props.workbenches[0].project.id))).toBeLessThan(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

function createProps() {
  return {
    workbenches: [
      createWorkbenchSnapshot('/tmp/marker-alpha', 'marker-alpha'),
      createWorkbenchSnapshot('/tmp/marker-beta', 'marker-beta')
    ],
    isDesktopRuntime: true,
    onAddProject: vi.fn(),
    onArchiveBranchWorkspace: vi.fn(),
    onCheckoutMainBranch: vi.fn(),
    onCreateBranchWorkspace: vi.fn(),
    onRemoveProject: vi.fn(),
    onReorderProject: vi.fn(),
    onSelectWorkspace: vi.fn()
  }
}

function markerFor(projectId: string): SVGSVGElement {
  return document.querySelector<SVGSVGElement>(
    `[data-project-card-id="${projectId}"] .project-dot`
  )!
}

function progress(marker: SVGSVGElement): number {
  return Number.parseFloat(marker.style.getPropertyValue(progressProperty))
}

function currentProjectId(): string | undefined {
  return document
    .querySelector<HTMLElement>('.workspace-row--active')
    ?.closest<HTMLElement>('[data-project-card-id]')?.dataset.projectCardId
}
