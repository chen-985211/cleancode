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
  const [response, setResponse] = useState<{
    key: string
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
  const key = JSON.stringify([
    project.id,
    project.directory,
    project.issueRepository,
    view.query,
    view.assignedToMe,
    view.label,
    view.limit,
    revision
  ])
  const data = response?.key === key ? response.data : undefined
  const error = response?.key === key ? response.error : undefined
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
        if (active) setResponse({ key, data: value })
      })
      .catch((error) => {
        if (active) setResponse({ key, error })
      })
    return () => {
      active = false
    }
  }, [key, open, project.directory, view.query, view.assignedToMe, view.label, view.limit])
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
    error,
    selected,
    loading: !data && !error,
    detail: detail?.key === detailKey ? detail.data : undefined,
    detailError: detail?.key === detailKey ? detail.error : undefined,
    refresh: () => setRevision((value) => value + 1)
  }
}
