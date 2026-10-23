export interface WorkbenchNodeLayoutInput {
  readonly isCollapsed?: boolean
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly width: number; readonly height: number }
}
