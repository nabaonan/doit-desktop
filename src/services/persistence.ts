import { validateSnapshot } from '@/domain/snapshot'
import { invokeCommand } from './ipc'
import type { AppError, SnapshotV2 } from '@/domain/types'

const DEBOUNCE_MS = 300
let timer: ReturnType<typeof setTimeout> | null = null
let pending: SnapshotV2 | null = null
let revision = 0

async function write(snapshot: SnapshotV2): Promise<{ ok: boolean; error?: AppError }> {
  const check = validateSnapshot(snapshot)
  if (!check.ok) {
    return { ok: false, error: { code: check.error.code, message: check.error.message } }
  }
  const result = await invokeCommand<{ revision: number }>('save_snapshot', { snapshot })
  if (!result.ok) return { ok: false, error: result.error }
  revision = result.value?.revision ?? revision
  return { ok: true }
}

/** 防抖 300ms 落盘；Rust 侧负责 tmp + fsync + rename 原子写与备份轮转。 */
export function scheduleSave(snapshot: SnapshotV2, onError?: (e: AppError) => void): void {
  pending = snapshot
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    const target = pending
    pending = null
    if (target) void write(target).then((r) => { if (!r.ok && r.error) onError?.(r.error) })
  }, DEBOUNCE_MS)
}

/** 窗口关闭前调用，保证最后一次编辑落盘。 */
export async function flushSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const target = pending
  pending = null
  if (target) await write(target)
}

export function currentRevision(): number {
  return revision
}
