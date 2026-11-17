/** doit-desktop 领域层类型 —— 与 DESIGN_SPEC.md 第 4 / 6.4 节、Android doit-apk 数据契约 v2 完全一致。 */

/** 优先级：0 低 / 1 普通 / 2 高 / 3 紧急（升级为 4 档，旧数据 0/1/2 语义不变）。 */
export type Priority = 0 | 1 | 2 | 3
export type ThemeName = 'light' | 'dark'
export type SkinName = 'mint' | 'soft'
export type StatsRange = 'week' | 'month' | 'year'
export type PageId = 'today' | 'stats' | 'calendar' | 'settings'
export type SyncStateKind = 'synced' | 'dirty' | 'syncing' | 'off' | 'error' | 'ready'

export interface Category {
  name: string
  color: string
  sortOrder: number
  updatedAt: number
}

export interface Task {
  uid: string
  parentUid: string | null
  title: string
  category: string
  priority: Priority
  done: boolean
  completedAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  depth: number
  sortOrder: number
}

export interface TaskNode extends Task {
  subs: TaskNode[]
}

export interface SnapshotV2 {
  version: 2
  revision: number
  exportedAt: number
  deviceId: string
  lastSyncAt: number | null
  categories: Category[]
  tasks: Task[]
}

export interface SnapshotMeta {
  revision: number
  exportedAt: number
  deviceId: string
  lastSyncAt: number | null
}

export interface WebDavConfig {
  enabled: boolean
  url: string
  username: string
  /** 系统钥匙串中的凭据引用；绝不保存明文密码 */
  passwordRef: string | null
  rootPath: string | null
}

export interface AppSettings {
  theme: ThemeName
  skin: SkinName
  progressColor: string
  webdav: WebDavConfig
}

export interface SyncStateDto {
  kind: SyncStateKind
  lastSyncAt: number | null
  revision: number
  error: AppError | null
}

export interface TodayStats {
  total: number
  done: number
  remaining: number
}

export type ErrorCode =
  | 'E_IO'
  | 'E_SNAPSHOT_INVALID'
  | 'E_WEBDAV_AUTH'
  | 'E_WEBDAV_NOT_FOUND'
  | 'E_DIR_PROBE'
  | 'E_WEBDAV_TIMEOUT'
  | 'E_NETWORK'
  | 'E_STALE_REMOTE'
  | 'E_CONFLICT_MERGE'
  | 'E_KEYRING'
  | 'E_PERMISSION'
  | 'E_UNKNOWN'

export interface AppError {
  code: ErrorCode
  message: string
  cause?: unknown
}

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export interface ConflictLog {
  uid: string
  field: string
  local: unknown
  remote: unknown
  winner: 'local' | 'remote'
}

export interface ChartTooltipState {
  anchor: { x: number; y: number }
  label: string
  count: number
  extra?: string
  pinned: boolean
}

export interface ChartClick {
  anchor: { x: number; y: number }
  label: string
  count: number
  extra?: string
  pinned: boolean
}
