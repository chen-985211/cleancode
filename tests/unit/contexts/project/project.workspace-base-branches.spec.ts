import {
  WorkspaceBaseBranchSelection,
  type WorkspaceBaseBranchRef
} from '../../../../src/contexts/project/domain/services/WorkspaceBaseBranchSelection'

const local = (name: string, checkedOut = false, upstream = ''): WorkspaceBaseBranchRef => ({
  kind: 'local',
  name: `refs/heads/${name}`,
  checkedOut,
  upstream
})
const remote = (name: string, target = ''): WorkspaceBaseBranchRef => ({
  kind: 'remote',
  name: `refs/remotes/${name}`,
  target: target ? `refs/remotes/${target}` : ''
})

const locals = [
  local('first'),
  local('root', true),
  local('work', false, 'refs/remotes/team/topic')
]
const remotes = [
  remote('backup/HEAD', 'backup/default'),
  remote('backup/aaa'),
  remote('origin/HEAD', 'origin/trunk'),
  remote('origin/main'),
  remote('origin/master'),
  remote('team/topic')
]

describe('workspace base selection', () => {
  it.each([
    ['all candidates', 'work', locals, remotes, 'origin/trunk', 'work'],
    ['missing workspace binding', 'gone', locals, remotes.slice(3), 'origin/main', 'root'],
    [
      'another remote default',
      'work',
      locals,
      remotes.filter((ref) => !ref.name.endsWith('origin/HEAD')),
      'backup/default',
      'work'
    ],
    ['origin master', 'work', locals, remotes.slice(4), 'origin/master', 'work'],
    [
      'upstream before first remote',
      'work',
      locals,
      [remotes[1], remotes[5]],
      'team/topic',
      'work'
    ],
    ['first local and remote', null, [locals[0]], [remotes[1]], 'backup/aaa', 'first'],
    ['local only', null, locals, [], null, 'root'],
    ['remote only', null, [], remotes, 'origin/trunk', null],
    ['empty repository', null, [], [], null, null]
  ] as const)(
    'selects the documented bases for %s',
    (_name, current, localRefs, remoteRefs, upstream, branch) => {
      const selection = new WorkspaceBaseBranchSelection(current)
      for (const ref of [...localRefs, ...remoteRefs]) selection.consider(ref)
      const branches = [
        ...(upstream ? [`refs/remotes/${upstream}`] : []),
        ...(branch ? [`refs/heads/${branch}`] : [])
      ]
      expect(selection.result()).toEqual({ branches, defaultBranch: branches[0] ?? null })
    }
  )
})
