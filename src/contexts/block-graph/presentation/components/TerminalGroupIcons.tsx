import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { MinusIcon } from '@phosphor-icons/react/dist/csr/Minus'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { PlayIcon } from '@phosphor-icons/react/dist/csr/Play'
import { StopIcon } from '@phosphor-icons/react/dist/csr/Stop'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import type { Icon, IconProps, IconWeight } from '@phosphor-icons/react'

type TerminalGroupIconProps = Omit<IconProps, 'alt' | 'mirrored' | 'weight'>

function GroupIcon({
  IconComponent,
  dataIcon,
  glyph,
  role,
  weight,
  ...props
}: TerminalGroupIconProps & {
  readonly IconComponent: Icon
  readonly dataIcon?: string
  readonly glyph: string
  readonly role: string
  readonly weight: IconWeight
}) {
  return (
    <IconComponent
      {...props}
      aria-hidden="true"
      data-icon={dataIcon}
      data-icon-glyph={glyph}
      data-icon-role={role}
      data-icon-weight={weight}
      focusable="false"
      weight={weight}
    />
  )
}

export function GroupStartIcon(props: TerminalGroupIconProps) {
  return (
    <GroupIcon
      {...props}
      IconComponent={PlayIcon}
      dataIcon="group-start"
      glyph="play"
      role="launch"
      weight="fill"
    />
  )
}

export function GroupStopIcon(props: TerminalGroupIconProps) {
  return (
    <GroupIcon
      {...props}
      IconComponent={StopIcon}
      dataIcon="group-stop"
      glyph="stop"
      role="stop"
      weight="fill"
    />
  )
}

export function GroupRestartIcon(props: TerminalGroupIconProps) {
  return (
    <GroupIcon
      {...props}
      IconComponent={ArrowClockwiseIcon}
      dataIcon="group-restart"
      glyph="arrow-clockwise"
      role="restart"
      weight="bold"
    />
  )
}

export function GroupExpandIcon(props: TerminalGroupIconProps) {
  return (
    <GroupIcon
      {...props}
      IconComponent={PlusIcon}
      dataIcon="group-expand"
      glyph="plus"
      role="expand-object"
      weight="bold"
    />
  )
}

export function GroupCollapseIcon(props: TerminalGroupIconProps) {
  return (
    <GroupIcon
      {...props}
      IconComponent={MinusIcon}
      dataIcon="group-collapse"
      glyph="minus"
      role="collapse-object"
      weight="bold"
    />
  )
}

export function GroupSaveIcon(props: TerminalGroupIconProps) {
  return (
    <GroupIcon {...props} IconComponent={CheckIcon} glyph="check" role="confirm" weight="bold" />
  )
}

export function GroupSavingIcon(props: TerminalGroupIconProps) {
  return (
    <GroupIcon
      {...props}
      IconComponent={CircleNotchIcon}
      glyph="circle-notch"
      role="loading"
      weight="bold"
    />
  )
}

export function GroupCancelIcon(props: TerminalGroupIconProps) {
  return <GroupIcon {...props} IconComponent={XIcon} glyph="x" role="close" weight="bold" />
}
