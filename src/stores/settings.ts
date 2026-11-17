import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { invokeCommand } from '@/services/ipc'
import { DEFAULT_SETTINGS, PROG_COLORS } from '@/constants/tokens'
import type { AppSettings, ThemeName, SkinName, WebDavConfig } from '@/domain/types'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(structuredClone(DEFAULT_SETTINGS))
  /** 仅内存：密码绝不写入 ref 之外的任何持久化对象，也不写入日志。 */
  const webdavPassword = ref('')
  const keyringAvailable = ref(true)

  const webdav = computed(() => settings.value.webdav)

  async function load(): Promise<void> {
    const result = await invokeCommand<AppSettings>('load_settings')
    if (result.ok) {
      settings.value = {
        ...DEFAULT_SETTINGS,
        ...result.value,
        webdav: { ...DEFAULT_SETTINGS.webdav, ...(result.value.webdav ?? {}) },
      }
    }
    applyThemeVars()
  }

  async function patch(partial: Partial<AppSettings>): Promise<void> {
    settings.value = {
      ...settings.value,
      ...partial,
      webdav: { ...settings.value.webdav, ...(partial.webdav ?? {}) },
    }
    applyThemeVars()
    await invokeCommand('save_settings', { settings: settings.value })
  }

  function applyThemeVars(): void {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    const body = document.body
    for (const el of [html, body]) {
      el.setAttribute('data-theme', settings.value.theme)
      el.setAttribute('data-skin', settings.value.skin)
      // 同时写入 html 与 body：body 上的 [data-theme=dark] 规则也定义了 --done-anim
      el.style.setProperty('--done-anim', settings.value.progressColor)
    }
  }

  function setTheme(theme: ThemeName): Promise<void> {
    return patch({ theme })
  }

  function setSkin(skin: SkinName): Promise<void> {
    return patch({ skin })
  }

  function setProgressColor(color: string): Promise<void> {
    return patch({ progressColor: PROG_COLORS.some((c) => c.value === color) ? color : PROG_COLORS[0].value })
  }

  /** 凭据只经 IPC 传给 Rust 写系统钥匙串；配置里只保存 passwordRef。 */
  async function saveWebdav(config: WebDavConfig, password: string): Promise<void> {
    webdavPassword.value = password
    const next: WebDavConfig = {
      ...config,
      passwordRef: password ? `doit-webdav:${config.username || 'default'}` : config.passwordRef,
    }
    const result = await invokeCommand('set_webdav_config', {
      config: next,
      password: password || undefined,
    })
    keyringAvailable.value = result.ok
    settings.value = { ...settings.value, webdav: next }
    await invokeCommand('save_settings', { settings: settings.value })
  }

  async function clearWebdavSecret(): Promise<void> {
    webdavPassword.value = ''
    await invokeCommand('clear_webdav_secret')
    settings.value = {
      ...settings.value,
      webdav: { ...settings.value.webdav, passwordRef: null },
    }
    await invokeCommand('save_settings', { settings: settings.value })
  }

  return {
    settings, webdavPassword, keyringAvailable, webdav,
    load, patch, applyThemeVars, setTheme, setSkin, setProgressColor, saveWebdav, clearWebdavSecret,
  }
})
