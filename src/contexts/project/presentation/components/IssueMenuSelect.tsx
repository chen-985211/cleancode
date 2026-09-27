import { ChoiceSelect } from '../../../../presentation/shared/components/ChoiceSelect'

export function IssueMenuSelect(props: {
  readonly active: boolean
  readonly label: string
  readonly value: string
  readonly options: readonly { readonly value: string; readonly label: string }[]
  readonly onChange: (value: string) => void
}) {
  return (
    <ChoiceSelect
      {...props}
      className="project-issues__select"
      menuClassName="project-issues-menu"
    />
  )
}
