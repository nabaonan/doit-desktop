import { isStaleRemote, merge3 } from '@/domain/merge'
import { fingerprint } from '@/domain/fingerprint'
import { invokeCommand } from './ipc'
import type { MergeResult } from '@/domain/merge'
import type { SnapshotV2, WebDavConfig } from '@/domain/types'

/** 合并编排：Rust 只负责 GET/PUT，规则全在 TS 领域层。 */
export function mergeWithRemote(
  local: SnapshotV2,
  remote: SnapshotV2,
  base: SnapshotV2 | null,
  now = Date.now(),
): MergeResult {
  if (isStaleRemote(remote, local)) {
    // 陈旧远端不能整体覆盖本地，但"远端独有且本地连墓碑都没有"的任务仍然要保留，
    // 否则 TUI 等端刚新增的任务会因 exportedAt/revision 落后被永久丢掉。
    const localUids = new Set(local.tasks.map((t) => t.uid))
    const extra = remote.tasks.filter((t) => !localUids.has(t.uid))
    const snapshot: SnapshotV2 = extra.length
      ? { ...local, tasks: [...local.tasks, ...extra] }
      : local
    return {
      snapshot,
      changed: extra.length,
      putRequired: true,
      conflicts: [{ uid: '*', field: 'snapshot', local: local.revision, remote: remote.revision, winner: 'local' }],
    }
  }
  return merge3(local, remote, base, { now, deviceId: local.deviceId })
}

export interface SyncOutcome {
  snapshot: SnapshotV2
  changed: number
  conflicts: number
  putRequired: boolean
  staleRemote: boolean
}

/**
 * 同步编排（纯领域层）：base 由 Rust 经 sync://progress 事件提供，
 * 或由调用方显式传入；Rust 侧负责 sync-base.json 的持久化，前端不发伪 IPC 命令。
 */
export function syncLocalWith(
  local: SnapshotV2,
  remote: SnapshotV2 | null,
  base: SnapshotV2 | null = null,
  now = Date.now(),
): SyncOutcome {
  const outcome = remote ? mergeWithRemote(local, remote, base, now) : null
  const snapshot = outcome?.snapshot ?? local
  const changed = outcome?.changed ?? 0
  // M5 阶段由 Rust 依据 putRequired 执行 PUT；M1 只落地本地与基线，避免误发未实现的 IPC
  return {
    snapshot,
    changed,
    conflicts: outcome?.conflicts.length ?? 0,
    putRequired: outcome?.putRequired ?? false,
    staleRemote: Boolean(remote && isStaleRemote(remote, local)),
  }
}

export function dataFingerprint(s: SnapshotV2): string {
  return fingerprint(s)
}

export async function testWebDav(config: WebDavConfig, password: string): Promise<{ ok: boolean; message: string }> {
  // 密码只作为参数在内存中传递，不写入任何配置对象
  const result = await invokeCommand<{ ok: boolean; rootPath: string; latencyMs: number }>('test_webdav', {
    config,
    password: password || undefined,
  })
  if (!result.ok) return { ok: false, message: result.error.message }
  if (!result.value.ok) return { ok: false, message: '未找到可用的 WebDAV 目录' }
  return { ok: true, message: `连接成功：${result.value.rootPath}（${result.value.latencyMs}ms）` }
}
