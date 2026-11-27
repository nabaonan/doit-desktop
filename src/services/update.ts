import { listen } from '@tauri-apps/api/event'
import { invokeCommand } from './ipc'
import type { Result } from '@/domain/types'

export interface UpdateAsset {
  name: string
  url: string
  size: number
}

export interface CheckUpdateResult {
  latestTag: string
  publishedAt: string
  htmlUrl: string
  asset: UpdateAsset | null
}

export interface DownloadProgress {
  phase: 'downloading' | 'done' | 'error'
  received: number
  total: number
  path: string | null
}

/** 语义版本比较：a < b 返回负数，a > b 返回正数，相等 0。容忍 v 前缀与缺段。 */
export function compareVersions(a: string, b: string): number {
  const pa = (a || '').replace(/^v/i, '').split('.').map((x) => Number(x) || 0)
  const pb = (b || '').replace(/^v/i, '').split('.').map((x) => Number(x) || 0)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

/** 是否有可更新的新版本（latest 严格大于 current）。 */
export function hasUpdate(current: string, latest: string): boolean {
  return compareVersions(current, latest) < 0
}

/** 统一显示格式：永远只带一个 v 前缀。
 * GitHub tag_name 自带 v（v0.1.10），而 Cargo/app_metadata 版本不带 v（0.1.10），
 * 各显示点直接拼 'v' 就会出现「vv0.1.10」。
 */
export function displayVersion(v: string): string {
  return `v${(v || '').replace(/^v+/i, '')}`
}

/** 检查更新：查 GitHub Releases API，仓库公开后匿名即可使用，无需 Token。 */
export async function checkForUpdate(): Promise<Result<CheckUpdateResult>> {
  return invokeCommand<CheckUpdateResult>('check_update', {})
}

export interface DownloadCallbacks {
  onProgress: (received: number, total: number) => void
  onDone: (path: string) => void
}

/**
 * 下载安装包：监听 update://progress 事件更新进度，完成后返回本地路径字符串。
 *
 * 注意：Rust 的 `download_update` 命令成功时返回的是**路径字符串**（CmdResult<String>），
 * 不是 `{ path }` 对象。历史上这里按 `{ path: string }` 标注，导致调用方
 * `result.value.path.replace(...)` 抛 `undefined is not an object`。这里做归一化，
 * 同时兼容未来可能改成 `{ path }` 结构的情况，调用方永远拿到 string 路径。
 */
export async function downloadUpdate(
  url: string,
  cb: DownloadCallbacks,
): Promise<Result<string>> {
  let unlisten: (() => void) | undefined
  try {
    unlisten = await listen<DownloadProgress>('update://progress', (event) => {
      const p = event.payload
      if (p.phase === 'done' && p.path) cb.onDone(p.path)
      cb.onProgress(p.received, p.total || 0)
    })
    const result = await invokeCommand<string | { path?: string }>('download_update', { url })
    if (!result.ok) {
      cb.onProgress(0, 0)
      return result
    }
    const raw = result.value
    const path = typeof raw === 'string' ? raw : (raw?.path ?? '')
    return { ok: true, value: path }
  } finally {
    unlisten?.()
  }
}
