import { WorkbenchIcon, type WorkbenchIconProps } from './WorkbenchIcons'

type TerminalGroupIconProps = Omit<WorkbenchIconProps, 'active' | 'role'>

export function GroupStartIcon(props: TerminalGroupIconProps) {
  return <WorkbenchIcon {...props} data-icon="group-start" role="launch" />
}

export function GroupStopIcon(props: TerminalGroupIconProps) {
  return <WorkbenchIcon {...props} data-icon="group-stop" role="stop" />
}

export function GroupRestartIcon(props: TerminalGroupIconProps) {
  return <WorkbenchIcon {...props} data-icon="group-restart" role="restart" />
}

export function GroupEditIcon(props: TerminalGroupIconProps) {
  return <WorkbenchIcon {...props} data-icon="group-edit" role="edit" />
}

export function GroupAddIcon(props: TerminalGroupIconProps) {
  return <WorkbenchIcon {...props} data-icon="group-add" role="group-add" />
}

export function GroupRemoveIcon(props: TerminalGroupIconProps) {
  return <WorkbenchIcon {...props} data-icon="group-remove" role="group-remove" />
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

export function GroupMemberUnlinkIcon(props: TerminalGroupIconProps) {
  return <WorkbenchIcon {...props} data-icon="group-member-unlink" role="disconnect" />
}

export function GroupExpandIcon(props: TerminalGroupIconProps) {
  return <WorkbenchIcon {...props} data-icon="group-expand" role="expand-object" />
}

export function GroupCollapseIcon(props: TerminalGroupIconProps) {
  return <WorkbenchIcon {...props} data-icon="group-collapse" role="collapse-object" />
}
