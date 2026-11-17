import type { AppError, ErrorCode, Result } from './types'

/** 统一错误码 → 用户可读文案；注意：message 中绝不允许携带 WebDAV 密码。 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  E_IO: '本地文件读写失败，已保留上一份备份',
  E_SNAPSHOT_INVALID: '数据快照格式不正确，已尝试回退到最近备份',
  E_WEBDAV_AUTH: 'WebDAV 鉴权失败，请检查账号与应用专用密码',
  E_WEBDAV_NOT_FOUND: '未找到同步文件，请检查服务器地址是否以 / 结尾',
  E_DIR_PROBE: 'WebDAV 目录探测失败，请检查 /webdav 路径是否误写',
  E_WEBDAV_TIMEOUT: '连接超时，请检查网络后重试',
  E_NETWORK: '网络不可用，已切换为离线编辑',
  E_STALE_REMOTE: '远端快照较旧，已忽略并强制重发本地数据',
  E_CONFLICT_MERGE: '合并出现异常，已保留本地副本',
  E_KEYRING: '系统钥匙串不可用，凭据仅在本次会话内有效',
  E_PERMISSION: '缺少运行权限，请检查 Tauri capabilities 配置',
  E_UNKNOWN: '发生未知错误',
}

export function appError(code: ErrorCode, message?: string, cause?: unknown): AppError {
  return { code, message: message ?? ERROR_MESSAGES[code], cause }
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err<E = AppError>(error: E): Result<never, E> {
  return { ok: false, error }
}

export function parseTauriError(raw: unknown): AppError {
  const text = typeof raw === 'string' ? raw : String((raw as { message?: unknown })?.message ?? raw)
  const matched = (Object.keys(ERROR_MESSAGES) as ErrorCode[]).find((code) => text.includes(code))
  if (matched) return appError(matched, undefined, raw)
  if (/401|403|unauthorized|forbidden/i.test(text)) return appError('E_WEBDAV_AUTH', undefined, raw)
  if (/404|not found/i.test(text)) return appError('E_WEBDAV_NOT_FOUND', undefined, raw)
  if (/timeout|timed out/i.test(text)) return appError('E_WEBDAV_TIMEOUT', undefined, raw)
  return appError('E_UNKNOWN', text, raw)
}
