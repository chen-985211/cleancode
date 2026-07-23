import { render } from '@testing-library/react'

import { AgentProviderIcon } from '../../../src/presentation/app-shell/AgentProviderIcon'
import type { AgentProviderIcon as AgentProviderIconDescriptor } from '../../../src/contexts/agent/application/ports/AgentProviderContribution'

describe('Agent Provider icon', () => {
  it('renders a bundled raster brand asset without converting it into a generic glyph', () => {
    const icon = {
      imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      imageType: 'png'
    } as const satisfies AgentProviderIconDescriptor

    const { container } = render(<AgentProviderIcon icon={icon} />)

    expect(container.querySelector('svg')).not.toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', icon.imageDataUrl)
    expect(container.querySelector('img')).toHaveAttribute('draggable', 'false')
  })
})
