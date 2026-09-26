import { useEffect, useState } from 'react'
import type { ProjectSnapshot } from '../../application/dto/ProjectSnapshot'
import type {
  ProjectIssuesSnapshot,
  ProjectIssueSnapshot
} from '../../application/dto/ProjectIssues'

interface IssueView {
  readonly search: string
  readonly query: string
  readonly label: string
  readonly assignedToMe: boolean
  readonly limit: number
  readonly selectedId?: string
  readonly detailOpen?: boolean
  readonly repositoryDraft?: string
}
const emptyView: IssueView = { search: '', query: '', label: '', assignedToMe: false, limit: 50 }

export function useProjectIssues(project: ProjectSnapshot, open: boolean) {
  const [views, setViews] = useState<Record<string, IssueView>>({})
  const [revision, setRevision] = useState(0)
  const [retry, setRetry] = useState(0)
  const [response, setResponse] = useState<{
    key: string
    scope: string
    limit: number
    data?: ProjectIssuesSnapshot
    error?: unknown
  }>()
  const [detail, setDetail] = useState<{
    key: string
    data?: ProjectIssueSnapshot
    error?: unknown
  }>()
  const view = views[project.id] ?? emptyView
  const update = (change: Partial<IssueView>) =>
    setViews((current) => ({
      ...current,
      [project.id]: { ...(current[project.id] ?? emptyView), ...change }
    }))
  const scope = JSON.stringify([
    project.id,
    project.directory,
    project.issueRepository,
    view.query,
    view.assignedToMe,
    view.label,
    revision
  ])
  const key = JSON.stringify([scope, view.limit, retry])
  // Only pagination may reuse results. A new query or explicit refresh owns a new scope.
  const data = response?.scope === scope && response.limit <= view.limit ? response.data : undefined
  const error = response?.key === key ? response.error : undefined
  const pending = response?.key !== key
  const selected = view.detailOpen
    ? data?.issues.find((issue) => issue.id === view.selectedId)
    : undefined
  const detailKey = JSON.stringify([project.id, selected?.id, data?.repository.name, revision])
  useEffect(() => {
    if (!open || !window.cleancode) return
    let active = true
    void window.cleancode
      .listProjectIssues({
        projectDirectory: project.directory,
        search: view.query,
        assignedToMe: view.assignedToMe,
        label: view.label,
        limit: view.limit
      })
      .then((value) => {
        if (active) setResponse({ key, scope, limit: view.limit, data: value })
      })
      .catch((error) => {
        if (active)
          setResponse((previous) => ({
            key,
            scope,
            limit: view.limit,
            data:
              previous?.scope === scope && previous.limit <= view.limit ? previous.data : undefined,
            error
          }))
      })
    return () => {
      active = false
    }
  }, [key, scope, open, project.directory, view.query, view.assignedToMe, view.label, view.limit])
  useEffect(() => {
    if (!open || !selected || !window.cleancode) return
    let active = true
    void window.cleancode
      .getProjectIssue({
        projectDirectory: project.directory,
        repository: selected.repository,
        number: selected.number
      })
      .then((value) => {
        if (active) setDetail({ key: detailKey, data: value })
      })
      .catch((error) => {
        if (active) setDetail({ key: detailKey, error })
      })
    return () => {
      active = false
    }
  }, [detailKey, open, project.directory, selected])
  return {
    view,
    update,
    data,
    error: data ? undefined : error,
    selected,
    loading: !data && pending,
    loadingMore: Boolean(data && pending),
    moreError: data ? error : undefined,
    loadMore: () => {
      if (!open || pending || !data?.hasMore) return
      if (error) setRetry((value) => value + 1)
      else if (view.limit < 500) update({ limit: Math.min(500, view.limit + 50) })
    },
    detail: detail?.key === detailKey ? detail.data : undefined,
    detailError: detail?.key === detailKey ? detail.error : undefined,
    refresh: () => setRevision((value) => value + 1)
  }
}
