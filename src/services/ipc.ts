import { invoke } from '@tauri-apps/api/core'
import { appError, parseTauriError } from '@/domain/errors'
import { emptySnapshot } from '@/domain/snapshot'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SNAPSHOT_STORAGE_KEY,
} from '@/constants/tokens'
import type { AppSettings, Result, SnapshotV2, SyncStateDto, WebDavConfig } from '@/domain/types'

/** 任何持久化对象都不得出现这些键；Rust 侧 config::save 会再次做白名单剔除。 */
export const SENSITIVE_KEYS = ['password', 'pass', 'token', 'secret', 'webdavPassword'] as const

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function stripSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripSensitive) as T
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.includes(k as (typeof SENSITIVE_KEYS)[number])) continue
    out[k] = stripSensitive(v)
  }
  return out as T
}

/** 测试与运行时自检：配置里不允许出现明文凭据键。 */
export function assertNoPlaintext(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true
  return Object.entries(value as Record<string, unknown>).every(
    ([k, v]) => !SENSITIVE_KEYS.includes(k as (typeof SENSITIVE_KEYS)[number]) && assertNoPlaintext(v),
  )
}

function readJSON<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(stripSensitive(value)))
}

function localSettings(): AppSettings {
  const stored = readJSON<Partial<AppSettings>>(SETTINGS_STORAGE_KEY, {})
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    webdav: { ...DEFAULT_SETTINGS.webdav, ...(stored.webdav ?? {}) },
  }
}

/** 非 Tauri 环境（vite dev / 单元测试）的降级实现：同样遵守「密码不落盘」。 */
async function browserFallback<T>(cmd: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
  const now = Date.now()
  switch (cmd) {
    case 'load_snapshot': {
      const existing = readJSON<SnapshotV2 | null>(SNAPSHOT_STORAGE_KEY, null)
      return { ok: true, value: (existing ?? emptySnapshot('doit-desktop-web', now)) as T }
    }
    case 'save_snapshot': {
      const snapshot = args.snapshot as SnapshotV2
      writeJSON(SNAPSHOT_STORAGE_KEY, snapshot)
      return { ok: true, value: { revision: snapshot.revision } as T }
    }
    case 'load_settings':
      return { ok: true, value: localSettings() as T }
    case 'save_settings': {
      const settings = stripSensitive(args.settings as AppSettings)
      writeJSON(SETTINGS_STORAGE_KEY, settings)
      return { ok: true, value: undefined as T }
    }
    case 'get_webdav_config':
      // 永不返回密码，只返回引用
      return { ok: true, value: stripSensitive(localSettings().webdav) as T }
    case 'set_webdav_config': {
      // 浏览器降级：没有系统钥匙串，密码只留在内存，绝不写入 localStorage
      const config = stripSensitive(args.config as WebDavConfig)
      const current = localSettings()
      writeJSON(SETTINGS_STORAGE_KEY, { ...current, webdav: config })
      return { ok: true, value: undefined as T }
    }
    case 'clear_webdav_secret': {
      const current = localSettings()
      writeJSON(SETTINGS_STORAGE_KEY, {
        ...current,
        webdav: { ...current.webdav, passwordRef: null },
      })
      return { ok: true, value: undefined as T }
    }
    case 'get_sync_state':
      return {
        ok: true,
        value: { kind: 'synced', lastSyncAt: now, revision: 12, error: null } as T,
      }
    case 'sync_now':
      return { ok: true, value: { jobId: `web-${now}` } as T }
    case 'test_webdav':
      return { ok: true, value: { ok: true, rootPath: '/doit/', latencyMs: 12 } as T }
    case 'open_external': {
      const url = String(args.url ?? '')
      if (!/^https:\/\//.test(url)) return { ok: false, error: appError('E_PERMISSION', '仅允许 https 外链') }
      if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
      return { ok: true, value: undefined as T }
    }
    case 'app_metadata':
      return {
        ok: true,
        value: { version: '0.1.0', platform: 'browser-dev', webview: navigator.userAgent } as T,
      }
    default:
      return { ok: false, error: appError('E_UNKNOWN', `未实现的 IPC 命令：${cmd}`) }
  }
}

/** 统一 IPC 封装：Result 语义 + 错误码映射 + 非 Tauri 自动降级。 */
export async function invokeCommand<T>(cmd: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
  if (!isTauri()) return browserFallback<T>(cmd, args)
  try {
    const value = await invoke<T>(cmd, args)
    return { ok: true, value }
  } catch (raw) {
    return { ok: false, error: parseTauriError(raw) }
  }
}

export interface TestWebDavResult {
  ok: boolean
  rootPath: string
  latencyMs: number
}

export interface SyncStatePayload extends SyncStateDto {
  remote?: SnapshotV2
}

export function emptyLocalSnapshot(now = Date.now()): SnapshotV2 {
  return emptySnapshot('doit-desktop', now)
}
