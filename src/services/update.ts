import { listen } from '@tauri-apps/api/event'
import { invokeCommand } from './ipc'
import type { Result } from '@/domain/types'

/** GitHub Token 的本地存储键：仅存 localStorage，不进快照/不同步/不备份。 */
export const UPDATE_TOKEN_KEY = 'doit-desktop-update-token'

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

/** 检查更新：查 GitHub Releases 最新版本（私有仓库需 token）。 */
export async function checkForUpdate(token?: string): Promise<Result<CheckUpdateResult>> {
  return invokeCommand<CheckUpdateResult>('check_update', { token: token || null })
}

export interface DownloadCallbacks {
  onProgress: (received: number, total: number) => void
  onDone: (path: string) => void
}

/**
 * 下载安装包：监听 update://progress 事件更新进度，完成后返回本地路径。
 * token 仅作参数内存传递，不落盘。
 */
export async function downloadUpdate(
  url: string,
  token: string | undefined,
  cb: DownloadCallbacks,
): Promise<Result<{ path: string }>> {
  let unlisten: (() => void) | undefined
  try {
    unlisten = await listen<DownloadProgress>('update://progress', (event) => {
      const p = event.payload
      if (p.phase === 'done' && p.path) cb.onDone(p.path)
      cb.onProgress(p.received, p.total || 0)
    })
    const result = await invokeCommand<{ path: string }>('download_update', {
      url,
      token: token || null,
    })
    if (!result.ok) {
      cb.onProgress(0, 0)
    }
    return result
  } finally {
    unlisten?.()
  }
}
