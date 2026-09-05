import type { zhCNErrorsMessages } from '../zh-CN/errors'

export const enErrorsMessages = {
  'error.TERMINAL_PROVIDER_AUTHENTICATION_FAILED':
    'The terminal runtime provider could not be authenticated.',
  'error.TERMINAL_PROVIDER_CONTROLLER_BUSY':
    'Another app instance still controls the terminal runtime. Close the duplicate instance and retry.',
  'error.TERMINAL_PROVIDER_IDENTITY_MISMATCH':
    'The terminal runtime identity does not match. The provider was left untouched to protect existing sessions.',
  'error.TERMINAL_PROVIDER_PROTOCOL_UNSUPPORTED':
    'The terminal runtime provider uses an incompatible protocol.',
  'error.TERMINAL_PROVIDER_UNAVAILABLE': 'The terminal runtime provider is unavailable.',
  'error.TERMINAL_RECOVERY_DATA_CORRUPTED': 'The saved terminal recovery data is damaged.',
  'error.TERMINAL_RECOVERY_STORAGE_LIMIT': 'The terminal recovery storage limit was reached.',
  'error.TERMINAL_RECOVERY_VERSION_UNSUPPORTED':
    'The saved terminal recovery data uses an unsupported version.',
  'error.TERMINAL_RUNTIME_NOT_READY':
    'The terminal runtime is still recovering. Wait for it to finish and try again.',
  'error.TERMINAL_SESSION_RETENTION_NOT_ALLOWED':
    'This terminal session cannot stay alive after the app exits.',
  'error.BLOCK_GRAPH_SNAPSHOT_CORRUPTED':
    'The project canvas data is corrupted. Restore the data before opening it.',
  'error.BLOCK_GRAPH_SNAPSHOT_VERSION_UNSUPPORTED':
    'The project canvas data uses a newer version. Upgrade cleancode to open it.',
  'error.BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES':
    'The workspace has uncommitted changes and cannot be archived.',
  'error.BRANCH_WORKSPACE_NOT_FOUND': 'The branch workspace does not exist. Refresh and try again.',
  'error.GIT_BRANCH_ALREADY_EXISTS':
    'The Git branch already exists, so a workspace with the same name cannot be created.',
  'error.GIT_BRANCH_CHECKED_OUT_IN_WORKTREE':
    'This branch is bound to another worktree and cannot be checked out in the default workspace.',
  'error.GIT_BRANCH_NOT_FOUND': 'The Git branch does not exist. Refresh the branch list and retry.',
  'error.GIT_WORKTREE_LOCKED': 'Git locked this workspace. Check the lock details and retry.',
  'error.COMMAND_TIMED_OUT':
    'The service was not ready in time. Check the launch log and readiness condition.',
  'error.MAIN_WORKSPACE_CANNOT_BE_ARCHIVED': 'The default workspace cannot be archived.',
  'error.MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES':
    'The default workspace has uncommitted changes and cannot switch branches.',
  'error.NOT_GIT_REPOSITORY': 'The current project is not a Git repository.',
  'error.PROJECT_NOT_FOUND': 'The project does not exist. Add it again.',
  'error.PROJECT_NOT_REMEMBERED': 'The project is not in the recent projects list. Add it again.',
  'error.WORKSPACE_EXTERNAL_OPEN_FAILED': 'The system could not open this workspace.',
  'error.WORKSPACE_OPEN_TARGET_UNAVAILABLE': 'VS Code is unavailable. Open the folder instead.',
  'error.QUICK_EXECUTION_SLOT_INVALID': 'The quick slot number is invalid.',
  'error.QUICK_EXECUTION_BAR_FULL': 'The quick execution bar is full. Clear a slot first.',
  'error.QUICK_EXECUTION_TARGET_INVALID': 'This object does not satisfy quick execution semantics.',
  'error.QUICK_EXECUTION_TARGET_NOT_FOUND': 'The quick execution target no longer exists.',
  'error.RUN_SCOPE_STALE': 'The project or workspace changed. Refresh and start again.',
  'error.RUN_START_BLOCKED': 'The runtime is cleaning up or has changed. Try again shortly.',
  'error.SERVICE_ENDPOINT_NOT_OPENABLE':
    'This service address has expired or cannot be opened directly.',
  'error.SERVICE_LISTENER_OWNERSHIP_MISMATCH':
    'Another process is listening on the service port. Edit the port settings and retry.',
  'error.SERVICE_LISTENER_OWNERSHIP_UNVERIFIED':
    'The service port listener could not be verified, so this run was stopped.',
  'error.SERVICE_PORT_ALLOCATION_EXHAUSTED':
    'No available port could be assigned. Edit the port settings and retry.',
  'error.SERVICE_PORT_CLEANUP_FAILED':
    'The service stopped, but port cleanup did not complete. Try again later.',
  'error.SERVICE_PORT_FIXED_CONFLICT':
    'The fixed port is busy. Locate the service using it or edit the port settings.',
  'error.SERVICE_PORT_MANAGEMENT_UNSUPPORTED':
    'Managed ports are unavailable in this environment. Use a supported runtime.',
  'error.TERMINAL_CONNECTION_DUPLICATE': 'This terminal dependency already exists.',
  'error.TERMINAL_CONNECTION_INVALID': 'A terminal cannot connect to itself.',
  'error.TERMINAL_CONNECTION_SCOPE_MISMATCH':
    'Both ends of a connection must be in the same group space.',
  'error.TERMINAL_SCOPE_MOVE_STALE': 'The workflow changed spaces. Try the move again.',
  'error.TERMINAL_EXECUTION_CONFIG_INVALID':
    'The terminal execution settings are invalid. Check exit codes, timeouts, and readiness conditions.',
  'error.TERMINAL_SHELL_UNSUPPORTED':
    'This shell does not support workflow commands. Use zsh, bash, sh, fish, or PowerShell.',
  'error.TERMINAL_WORKFLOW_COMMAND_MISSING':
    'Every terminal in the workflow needs a launch command.',
  'error.TERMINAL_WORKFLOW_CYCLE': 'This dependency would create a cycle and cannot be connected.',
  'error.TERMINAL_WORKFLOW_EMPTY': 'There are no terminal commands to run.',
  'error.TERMINAL_WORKFLOW_SCOPE_CONFLICT':
    'Some terminals already belong to a running workflow. Stop that run first.',
  'error.UNEXPECTED_ERROR': 'The action failed. Try again later.'
} as const satisfies { readonly [Key in keyof typeof zhCNErrorsMessages]: string }
