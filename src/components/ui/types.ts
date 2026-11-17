export interface MenuChild {
  key: string
  label: string
  color?: string
  current?: boolean
}

export interface MenuItem {
  key: 'edit' | 'sub' | 'prio' | 'cat' | 'del'
  label: string
  icon: string
  danger?: boolean
  children?: MenuChild[]
}
