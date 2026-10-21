import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { MinusIcon } from '@phosphor-icons/react/dist/csr/Minus'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple'
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

export function GroupRenameIcon(props: TerminalGroupIconProps) {
  return (
    <GroupIcon
      {...props}
      IconComponent={PencilSimpleIcon}
      dataIcon="group-rename"
      glyph="pencil-simple"
      role="edit"
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

export function GroupDissolveIcon({
  className,
  size = 24,
  strokeWidth = 2,
  ...props
}: TerminalGroupIconProps) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      className={className}
      data-icon="group-dissolve"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M10 13a4 4 0 0 0 6.04.43l2.4-2.4a4 4 0 0 0-5.66-5.66l-1.36 1.37" />
      <path d="M14 11a4 4 0 0 0-6.04-.43l-2.4 2.4a4 4 0 0 0 5.66 5.66l1.36-1.37" />
      <path className="terminal-group-icon__cutout" d="m14.35 14.7 2.35 2.35" />
      <path
        className="terminal-group-icon__disconnect-accent"
        d="M15.2 14.2a3.8 3.8 0 1 1-1.1 2.7"
        data-icon-part="disconnect-accent"
      />
    </svg>
  )
}
