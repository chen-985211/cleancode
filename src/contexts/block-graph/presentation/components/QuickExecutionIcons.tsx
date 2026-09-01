import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import { FlowArrowIcon } from '@phosphor-icons/react/dist/csr/FlowArrow'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { StackIcon } from '@phosphor-icons/react/dist/csr/Stack'
import { TerminalWindowIcon } from '@phosphor-icons/react/dist/csr/TerminalWindow'
import type { Icon, IconProps, IconWeight } from '@phosphor-icons/react'

const definitions = {
  add: [PlusIcon, 'plus', 'bold'],
  more: [DotsThreeIcon, 'dots-three', 'bold'],
  rebind: [ArrowClockwiseIcon, 'arrow-clockwise', 'bold'],
  terminal: [TerminalWindowIcon, 'terminal-window', 'regular'],
  'terminal-group': [StackIcon, 'stack', 'regular'],
  workflow: [FlowArrowIcon, 'flow-arrow', 'regular']
} satisfies Record<string, readonly [Icon, string, IconWeight]>

export type QuickExecutionIconRole = keyof typeof definitions

export function QuickExecutionIcon({
  role,
  ...props
}: Omit<IconProps, 'alt' | 'mirrored' | 'weight'> & {
  readonly role: QuickExecutionIconRole
}) {
  const [IconComponent, glyph, weight] = definitions[role]
  return (
    <IconComponent
      {...props}
      aria-hidden="true"
      data-icon-glyph={glyph}
      data-icon-role={role === 'rebind' ? 'restart' : role}
      data-icon-weight={weight}
      focusable="false"
      weight={weight}
    />
  )
}
