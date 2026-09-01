export const enWorkflowMessages = {
  'workflow.operationFailedTitle': 'Workflow action failed',
  'workflow.operationFailed': 'The workflow action failed. Try again later.',
  'workflow.failureTitle': 'Workflow failed',
  'workflow.focusNode': 'Focus workflow node “{terminalName}”',
  'workflow.inspectOutput': 'Check this terminal’s output.',
  'workflow.exitCodeOutput': 'Exit code {exitCode}. Check the terminal output.',
  'workflow.singleFailure': 'Terminal “{terminalName}” failed. {detail}',
  'workflow.multipleFailures': '{count} terminals failed. Check the failed nodes’ terminal output.',
  'workflow.generalFailure':
    'The workflow did not complete. Check the failed nodes’ terminal output.',
  'workflow.succeededTitle': 'Workflow succeeded',
  'workflow.stoppedTitle': 'Workflow stopped',
  'workflow.stopAction': 'Stop this run',
  'workflow.stoppingAction': 'Stopping…',
  'workflow.readyTitle': 'Workflow services are ready',
  'workflow.runningTitle': 'Workflow running',
  'workflow.scopeSingle': 'Starting from “{rootName}” · {count} terminals',
  'workflow.scopeMultiple': '{rootCount} starting points · {count} terminals',
  'workflow.scopeCount': '{count} terminals',
  'workflow.scopeEmpty': 'This run contains no terminals'
} as const
