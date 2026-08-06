import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
import { ArrowsInSimpleIcon } from '@phosphor-icons/react/dist/csr/ArrowsInSimple'
import { ArrowsOutSimpleIcon } from '@phosphor-icons/react/dist/csr/ArrowsOutSimple'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy'
import { CornersOutIcon } from '@phosphor-icons/react/dist/csr/CornersOut'
import { CrosshairIcon } from '@phosphor-icons/react/dist/csr/Crosshair'
import { DesktopTowerIcon } from '@phosphor-icons/react/dist/csr/DesktopTower'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple'
import { FlowArrowIcon } from '@phosphor-icons/react/dist/csr/FlowArrow'
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen'
import { GearSixIcon } from '@phosphor-icons/react/dist/csr/GearSix'
import { LinkBreakIcon } from '@phosphor-icons/react/dist/csr/LinkBreak'
import { MapTrifoldIcon } from '@phosphor-icons/react/dist/csr/MapTrifold'
import { MinusIcon } from '@phosphor-icons/react/dist/csr/Minus'
import { PauseCircleIcon } from '@phosphor-icons/react/dist/csr/PauseCircle'
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { PlayIcon } from '@phosphor-icons/react/dist/csr/Play'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { PushPinIcon } from '@phosphor-icons/react/dist/csr/PushPin'
import { RobotIcon } from '@phosphor-icons/react/dist/csr/Robot'
import { RocketLaunchIcon } from '@phosphor-icons/react/dist/csr/RocketLaunch'
import { ShieldWarningIcon } from '@phosphor-icons/react/dist/csr/ShieldWarning'
import { SquaresFourIcon } from '@phosphor-icons/react/dist/csr/SquaresFour'
import { StackIcon } from '@phosphor-icons/react/dist/csr/Stack'
import { StackMinusIcon } from '@phosphor-icons/react/dist/csr/StackMinus'
import { StackPlusIcon } from '@phosphor-icons/react/dist/csr/StackPlus'
import { StarIcon } from '@phosphor-icons/react/dist/csr/Star'
import { StopIcon } from '@phosphor-icons/react/dist/csr/Stop'
import { TerminalWindowIcon } from '@phosphor-icons/react/dist/csr/TerminalWindow'
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash'
import { WarningIcon } from '@phosphor-icons/react/dist/csr/Warning'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import type { Icon, IconProps, IconWeight } from '@phosphor-icons/react'

const workbenchIconDefinitions = {
  add: [PlusIcon, 'plus', 'bold'],
  agent: [RobotIcon, 'robot', 'regular'],
  approval: [ShieldWarningIcon, 'shield-warning', 'fill'],
  canvas: [SquaresFourIcon, 'squares-four', 'regular'],
  close: [XIcon, 'x', 'bold'],
  collapse: [CaretUpIcon, 'caret-up', 'bold'],
  'collapse-object': [ArrowsInSimpleIcon, 'arrows-in-simple', 'bold'],
  confirm: [CheckIcon, 'check', 'bold'],
  copy: [CopyIcon, 'copy', 'bold'],
  delete: [TrashIcon, 'trash', 'bold', 'fill'],
  disclosure: [CaretDownIcon, 'caret-down', 'bold'],
  disconnect: [LinkBreakIcon, 'link-break', 'bold'],
  download: [DownloadSimpleIcon, 'download-simple', 'bold'],
  edit: [PencilSimpleIcon, 'pencil-simple', 'bold'],
  error: [WarningCircleIcon, 'warning-circle', 'fill'],
  'expand-object': [ArrowsOutSimpleIcon, 'arrows-out-simple', 'bold'],
  favorite: [StarIcon, 'star', 'bold', 'fill'],
  'fit-canvas': [CornersOutIcon, 'corners-out', 'bold'],
  'group-add': [StackPlusIcon, 'stack-plus', 'bold'],
  'group-remove': [StackMinusIcon, 'stack-minus', 'bold'],
  launch: [PlayIcon, 'play', 'fill'],
  loading: [CircleNotchIcon, 'circle-notch', 'bold'],
  locate: [CrosshairIcon, 'crosshair', 'bold'],
  minimap: [MapTrifoldIcon, 'map-trifold', 'regular'],
  more: [DotsThreeIcon, 'dots-three', 'bold'],
  'open-external': [ArrowSquareOutIcon, 'arrow-square-out', 'bold'],
  'open-project': [FolderOpenIcon, 'folder-open', 'bold'],
  paused: [PauseCircleIcon, 'pause-circle', 'fill'],
  'quick-execution-add': [RocketLaunchIcon, 'rocket-launch', 'bold'],
  remove: [MinusIcon, 'minus', 'bold'],
  restart: [ArrowClockwiseIcon, 'arrow-clockwise', 'bold'],
  retention: [PushPinIcon, 'push-pin', 'bold', 'fill'],
  'runtime-unavailable': [DesktopTowerIcon, 'desktop-tower', 'regular'],
  settings: [GearSixIcon, 'gear-six', 'bold'],
  stop: [StopIcon, 'stop', 'fill'],
  terminal: [TerminalWindowIcon, 'terminal-window', 'regular'],
  'terminal-group': [StackIcon, 'stack', 'regular'],
  warning: [WarningIcon, 'warning', 'fill'],
  workflow: [FlowArrowIcon, 'flow-arrow', 'regular'],
  'zoom-in': [PlusIcon, 'plus', 'bold'],
  'zoom-out': [MinusIcon, 'minus', 'bold']
} satisfies Record<string, readonly [Icon, string, IconWeight, IconWeight?]>

export type WorkbenchIconRole = keyof typeof workbenchIconDefinitions

export interface WorkbenchIconProps extends Omit<IconProps, 'alt' | 'mirrored' | 'weight'> {
  readonly active?: boolean
  readonly role: WorkbenchIconRole
}

export function WorkbenchIcon({ active = false, role, ...props }: WorkbenchIconProps) {
  const [IconComponent, glyph, defaultWeight, activeWeight] = workbenchIconDefinitions[role]
  const weight = active && activeWeight ? activeWeight : defaultWeight

  return (
    <IconComponent
      {...props}
      aria-hidden="true"
      data-icon-glyph={glyph}
      data-icon-role={role}
      data-icon-weight={weight}
      focusable="false"
      weight={weight}
    />
  )
}
