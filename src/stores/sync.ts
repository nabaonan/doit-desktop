import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { appError } from '@/domain/errors'
import { merge3 } from '@/domain/merge'
import { invokeCommand, isTauri } from '@/services/ipc'
import { testWebDav } from '@/services/webdav'
import { useTaskStore } from './tasks'
import { useSettingsStore } from './settings'
import { useUIStore } from './ui'
import type { AppError, ErrorCode, SnapshotV2, SyncStateKind, WebDavConfig } from '@/domain/types'

interface ProgressPayload {
  jobId: string
  phase: string
  percent: number
  remote?: SnapshotV2
  base?: SnapshotV2 | null
}

interface StatePayload {
  kind: SyncStateKind
  lastSyncAt: number | null
  revision: number
  error?: { code: string; message: string } | null
  jobId?: string | null
}

export const useSyncStore = defineStore('sync', () => {
  const tasks = useTaskStore()
  const settings = useSettingsStore()
  const ui = useUIStore()
  const syncing = ref(false)
  const error = ref<AppError | null>(null)
  const lastSyncAt = ref<number | null>(Date.now())
  const manualOff = ref(false)
  const progress = ref('')

  const kind = computed<SyncStateKind>(() => {
    if (manualOff.value || !settings.webdav.enabled) return 'off'
    if (error.value) return 'error'
    if (syncing.value) return 'syncing'
    return tasks.dirty ? 'dirty' : 'synced'
  })

  watch(() => tasks.dirty, (dirty) => { if (dirty) error.value = null })

  function markDirty(): void {
    lastSyncAt.value = lastSyncAt.value ?? Date.now()
  }

  function markSynced(): void {
    tasks.markClean()
    error.value = null
    lastSyncAt.value = Date.now()
  }

  /**
   * 与 Rust 的合并握手：收到 merge-required 后由 TS 领域层合并，
   * 再调用 save_snapshot(merged) 唤醒 Rust 继续 PUT。Rust 不实现任何业务合并规则。
   */
  async function registerListeners(): Promise<void> {
    await listen<ProgressPayload>('sync://progress', async (event) => {
      const p = event.payload
      progress.value = `${p.phase} ${p.percent}%`
      if (p.phase !== 'merge-required' || !p.remote) return
      try {
        const result = merge3(tasks.toSnapshotValue(), p.remote, p.base ?? null, { now: Date.now() })
        const saved = await invokeCommand('save_snapshot', { snapshot: result.snapshot })
        if (!saved.ok) throw new Error(saved.error.message)
        tasks.load(result.snapshot)
        ui.notify(`已合并 ${result.changed} 条变更`)
      } catch (e) {
        error.value = appError('E_CONFLICT_MERGE', e instanceof Error ? e.message : '合并失败')
      }
    })
    await listen<StatePayload>('sync://state', (event) => {
      const s = event.payload
      if (s.kind === 'syncing') syncing.value = true
      else if (s.kind === 'synced') { syncing.value = false; markSynced(); lastSyncAt.value = s.lastSyncAt }
      else if (s.kind === 'error') {
        syncing.value = false
        error.value = s.error
          ? { code: s.error.code as ErrorCode, message: s.error.message }
          : appError('E_UNKNOWN')
      } else { syncing.value = false }
    })
  }

  if (isTauri()) void registerListeners()

  async function syncNow(): Promise<void> {
    if (syncing.value) return
    // 同步未启用（开关关闭 / 未配置 WebDAV）：给出明确提示，不静默也不进入 syncing
    if (manualOff.value || !settings.webdav.enabled) {
      ui.notify('尚未设置同步 · 请到设置页填写并开启 WebDAV 同步')
      return
    }
    syncing.value = true
    error.value = null
    try {
      const result = await invokeCommand<{ jobId: string }>('sync_now')
      if (!result.ok) {
        error.value = result.error
        syncing.value = false
        return
      }
      // 非 Tauri 降级环境没有事件驱动，直接对齐；Tauri 下等 sync://state=synced
      if (!isTauri()) markSynced()
    } catch (e) {
      error.value = appError('E_NETWORK', e instanceof Error ? e.message : '同步启动失败')
      syncing.value = false
    }
  }

  async function testConnection(config: WebDavConfig, password: string): Promise<string> {
    const result = await testWebDav(config, password)
    if (!result.ok) error.value = { code: 'E_WEBDAV_AUTH', message: result.message }
    return result.message
  }

  function setEnabled(enabled: boolean): Promise<void> {
    manualOff.value = !enabled
    return settings.patch({ webdav: { ...settings.webdav, enabled } })
  }

  return {
    kind, syncing, error, lastSyncAt, progress,
    syncNow, markDirty, markSynced, testConnection, setEnabled, registerListeners,
  }
})

