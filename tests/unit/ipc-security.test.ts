import { beforeEach, describe, expect, it } from 'vitest'
import { assertNoPlaintext, invokeCommand, SENSITIVE_KEYS } from '@/services/ipc'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, SNAPSHOT_STORAGE_KEY } from '@/constants/tokens'
import { createSeedSnapshot } from '@/domain/seed'
import type { AppSettings, WebDavConfig } from '@/domain/types'

const PASSWORD = 'super-secret-token-123'

function stored(key: string): string {
  return localStorage.getItem(key) ?? ''
}

describe('WebDAV 凭据安全', () => {
  beforeEach(() => localStorage.clear())

  it('SENSITIVE_KEYS 覆盖常见明文字段名', () => {
    expect(SENSITIVE_KEYS).toContain('password')
    expect(SENSITIVE_KEYS).toContain('pass')
    expect(SENSITIVE_KEYS).toContain('token')
    expect(assertNoPlaintext({ a: { password: 'x' } })).toBe(false)
    expect(assertNoPlaintext({ a: { name: 'ok' } })).toBe(true)
  })

  it('set_webdav_config 传入密码后，localStorage 中绝无明文', async () => {
    const config: WebDavConfig = {
      enabled: true, url: 'https://dav.example.com/doit/', username: 'nbn',
      passwordRef: 'doit-webdav:nbn', rootPath: null,
    }
    const result = await invokeCommand('set_webdav_config', { config, password: PASSWORD })
    expect(result.ok).toBe(true)
    const blob = stored(SETTINGS_STORAGE_KEY) + stored(SNAPSHOT_STORAGE_KEY)
    expect(blob).not.toContain(PASSWORD)
    expect(blob).not.toContain('"password"')
    expect(assertNoPlaintext(JSON.parse(stored(SETTINGS_STORAGE_KEY) || '{}'))).toBe(true)
  })

  it('save_settings 会剥离误传入的 password / token 字段', async () => {
    const dirty = { ...DEFAULT_SETTINGS, password: PASSWORD, webdav: { ...DEFAULT_SETTINGS.webdav, token: PASSWORD } } as AppSettings & Record<string, unknown>
    await invokeCommand('save_settings', { settings: dirty })
    expect(stored(SETTINGS_STORAGE_KEY)).not.toContain(PASSWORD)
    expect(stored(SETTINGS_STORAGE_KEY)).not.toContain('"password"')
  })

  it('get_webdav_config 只返回引用，不含密码', async () => {
    const config: WebDavConfig = {
      enabled: true, url: 'https://dav.example.com/doit/', username: 'nbn',
      passwordRef: 'doit-webdav:nbn', rootPath: null,
    }
    await invokeCommand('set_webdav_config', { config, password: PASSWORD })
    const result = await invokeCommand<WebDavConfig>('get_webdav_config')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.passwordRef).toBe('doit-webdav:nbn')
      expect(JSON.stringify(result.value)).not.toContain(PASSWORD)
      expect('password' in result.value).toBe(false)
    }
  })

  it('clear_webdav_secret 清空引用', async () => {
    await invokeCommand('set_webdav_config', {
      config: { enabled: true, url: 'https://x/', username: 'u', passwordRef: 'ref', rootPath: null },
      password: PASSWORD,
    })
    await invokeCommand('clear_webdav_secret')
    const result = await invokeCommand<WebDavConfig>('get_webdav_config')
    expect(result.ok && result.value.passwordRef).toBeNull()
  })

  it('save_snapshot 写入的快照同样不含密码', async () => {
    await invokeCommand('save_snapshot', { snapshot: createSeedSnapshot() })
    expect(stored(SNAPSHOT_STORAGE_KEY)).not.toContain('password')
    expect(assertNoPlaintext(JSON.parse(stored(SNAPSHOT_STORAGE_KEY)))).toBe(true)
  })

  it('无持久化数据时 load_snapshot 返回空快照，绝不注入示例任务', async () => {
    localStorage.clear()
    const result = await invokeCommand<{ tasks: unknown[]; categories: unknown[] }>('load_snapshot')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.tasks).toEqual([])
    expect(result.value.categories).toEqual([])
  })

  it('open_external 白名单拒绝非 https', async () => {
    const result = await invokeCommand('open_external', { url: 'http://evil.example.com' })
    expect(result.ok).toBe(false)
  })
})
