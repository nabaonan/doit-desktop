<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { invokeCommand, isTauri } from '@/services/ipc'
import {
  checkForUpdate, compareVersions, downloadUpdate, hasUpdate,
} from '@/services/update'
import type { CheckUpdateResult } from '@/services/update'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import Icon from '@/components/ui/Icon.vue'
import { PROG_COLORS } from '@/constants/tokens'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore } from '@/stores/sync'
import { useUIStore } from '@/stores/ui'
import type { SkinName, ThemeName } from '@/domain/types'

const settings = useSettingsStore()
const sync = useSyncStore()
const ui = useUIStore()

const url = ref(settings.webdav.url)
const username = ref(settings.webdav.username)
const urlTouched = ref(false)

watch(() => settings.webdav, (w) => {
  url.value = w.url
  username.value = w.username
})

const urlBad = computed(() => {
  const u = url.value.trim()
  // 只校验“合法 http(s) 地址”，不强制尾斜杠：Rust normalize_base 会自动补根斜杠，
  // 强制 `/` 结尾曾导致“测试成功但保存按钮被锁”（用户地址常不带尾斜杠）。
  return urlTouched.value && Boolean(u) && !/^https?:\/\/\S+$/i.test(u)
})
const canSave = computed(() => !urlBad.value && Boolean(url.value.trim()) && Boolean(username.value.trim()) && Boolean(settings.webdavPassword || settings.webdav.passwordRef))

function buildConfig() {
  return {
    enabled: settings.webdav.enabled,
    url: url.value.trim(),
    username: username.value.trim(),
    passwordRef: settings.webdav.passwordRef,
    rootPath: settings.webdav.rootPath,
  }
}

async function test(): Promise<void> {
  const message = await sync.testConnection(buildConfig(), settings.webdavPassword)
  ui.notify(message)
}

async function save(): Promise<void> {
  await settings.saveWebdav(buildConfig(), settings.webdavPassword)
  ui.notify('凭据已写入系统钥匙串，配置未包含明文密码')
  await sync.syncNow()
}

async function clearSecret(): Promise<void> {
  await settings.clearWebdavSecret()
  ui.notify('已清除系统钥匙串中的凭据')
}

function theme(t: ThemeName): void { void settings.setTheme(t) }
function skin(s: SkinName): void { void settings.setSkin(s) }
function color(v: string): void { void settings.setProgressColor(v) }
function toggleEnabled(v: boolean): void {
  void settings.patch({ webdav: { ...settings.webdav, enabled: v } })
}

/** 开机自启：经 Rust 自定义命令调用插件，不直接写注册表 / plist。 */
const autostart = ref(false)
const checkingUpdate = ref(false)

// —— 检查更新（GitHub Releases，公开仓库匿名即可，无需 Token）——
const currentVersion = ref('0.1.3') // 兜底：正常情况下以 app_metadata（运行时真实版本）为准
const updateInfo = ref<CheckUpdateResult | null>(null)
const downloading = ref(false)
const dlReceived = ref(0)
const dlTotal = ref(0)
const dlPath = ref('')
const dlPercent = computed(() => {
  if (!dlTotal.value) return 0
  return Math.min(100, Math.round((dlReceived.value / dlTotal.value) * 100))
})

onMounted(async () => {
  if (!isTauri()) return
  const meta = await invokeCommand<{ version: string }>('app_metadata')
  if (meta.ok) currentVersion.value = meta.value.version
  const autostartResult = await invokeCommand<boolean>('get_autostart')
  if (autostartResult.ok) autostart.value = autostartResult.value
})

async function toggleAutostart(v: boolean): Promise<void> {
  if (!isTauri()) { ui.notify('桌面端才支持开机自启'); return }
  const result = await invokeCommand('set_autostart', { enabled: v })
  if (result.ok) {
    autostart.value = v
    ui.notify(v ? '已开启开机自启' : '已关闭开机自启')
  } else {
    ui.notify(`设置开机自启失败：${result.error}`)
  }
}

/** 检查更新：直接查 GitHub Releases 最新版本，不做签名 updater 依赖。 */
async function checkUpdate(): Promise<void> {
  if (!isTauri()) { ui.notify('桌面端才支持检查更新'); return }
  checkingUpdate.value = true
  updateInfo.value = null
  dlPath.value = ''
  try {
    const result = await checkForUpdate()
    if (!result.ok) {
      ui.notify(`检查更新失败：${result.error}`)
      return
    }
    const info = result.value
    updateInfo.value = info
    if (!hasUpdate(currentVersion.value, info.latestTag)) {
      ui.notify(`已是最新版本（v${currentVersion.value}）`)
      updateInfo.value = null
    }
  } catch (e) {
    ui.notify(`检查更新失败：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    checkingUpdate.value = false
  }
}

/** 下载最新版安装包，显示进度；完成后给出本地路径与 Releases 入口。 */
async function runDownload(): Promise<void> {
  const info = updateInfo.value
  if (!info?.asset) { ui.notify('远端没有可下载的安装包'); return }
  downloading.value = true
  dlReceived.value = 0
  dlTotal.value = info.asset.size || 0
  try {
    const result = await downloadUpdate(
      info.asset.url,
      {
        onProgress: (received, total) => {
          dlReceived.value = received
          if (total) dlTotal.value = total
        },
        onDone: (path) => { dlPath.value = path },
      },
    )
    if (!result.ok) {
      ui.notify(`下载失败：${result.error}`)
      downloading.value = false
      return
    }
    ui.notify(`已下载：${result.value.replace(/^.*\//, '')}`)
    downloading.value = false
  } catch (e) {
    ui.notify(`下载失败：${e instanceof Error ? e.message : String(e)}`)
    downloading.value = false
  }
}

function openReleases(): void {
  const url = updateInfo.value?.htmlUrl ?? 'https://github.com/nabaonan/doit-desktop/releases'
  void invokeCommand('open_external', { url })
}
</script>

<template>
  <div class="page">

    <div class="set-section">
      <h3>外观</h3>
      <div class="field">
        <label>主题</label>
        <div class="seg">
          <button :class="{ on: settings.settings.theme === 'light' }" @click="theme('light')">薄荷绿</button>
          <button :class="{ on: settings.settings.theme === 'dark' }" @click="theme('dark')">深夜青灰</button>
        </div>
      </div>
      <div class="field">
        <label>完成动画皮肤</label>
        <div class="seg">
          <button :class="{ on: settings.settings.skin === 'mint' }" @click="skin('mint')">清新</button>
          <button :class="{ on: settings.settings.skin === 'soft' }" @click="skin('soft')">柔和</button>
        </div>
      </div>
      <div class="field">
        <label>完成进度风格</label>
        <div class="swatch-row">
          <button
            v-for="c in PROG_COLORS" :key="c.value"
            class="swatch" :class="{ on: settings.settings.progressColor === c.value }"
            :title="c.name" :style="{ background: c.value, '--swatch-color': c.value }"
            @click="color(c.value)"
          />
        </div>
      </div>
    </div>

    <div class="set-section">
      <h3>WebDAV 同步</h3>
      <div class="field">
        <label>同步状态</label>
        <span class="sync-state" :class="sync.kind">
          <Icon :name="sync.kind === 'synced' ? 'cloudOk' : sync.kind === 'dirty' ? 'cloudDirty' : 'cloud'" :size="17" />
          {{ sync.kind === 'synced' ? '已与远程同步' : sync.kind === 'ready' ? '已开启暂未同步' : sync.kind === 'dirty' ? '有未同步更改' : sync.kind === 'syncing' ? '同步中…' : sync.kind === 'error' ? '同步异常' : '同步已关闭' }}
        </span>
      </div>
      <div class="field">
        <label>启用同步</label>
        <UiSwitch :model-value="settings.webdav.enabled" label="启用 WebDAV 同步" @update:model-value="toggleEnabled" />
      </div>
      <!-- 未开启同步时不展示服务器配置与操作按钮，避免误导（开启后才需要配置） -->
      <template v-if="settings.webdav.enabled">
        <div class="field">
          <label>服务器地址</label>
          <input
            v-model="url" class="input" :class="{ bad: urlBad }"
            placeholder="https://dav.example.com/doit/" @blur="urlTouched = true"
          />
        </div>
        <div class="field">
          <label>账号</label>
          <input v-model="username" class="input" placeholder="WebDAV 用户名" />
        </div>
        <div class="field">
          <label>密码 / 令牌</label>
          <input
            v-model="settings.webdavPassword" class="input" type="password" autocomplete="new-password"
            placeholder="仅写入系统钥匙串，绝不落盘"
          />
        </div>
        <div class="field" style="border: none; justify-content: flex-end; gap: 10px">
          <button class="btn ghost" @click="clearSecret">清除凭据</button>
          <button class="btn ghost" @click="test">测试连接</button>
          <button class="btn accent" :disabled="!canSave" @click="save">保存并同步</button>
        </div>
        <p class="hint" style="margin-top: 12px">
          密码只在输入框与进程内存中存在，提交后写入系统钥匙串；配置文件、日志、错误信息与备份文件均不含明文。
          {{ settings.keyringAvailable ? '' : '当前环境钥匙串不可用，凭据仅在本次会话内有效。' }}
        </p>
      </template>
    </div>

    <div class="set-section">
      <h3>系统</h3>
      <div class="field">
        <label>开机自启</label>
        <UiSwitch :model-value="autostart" label="登录时自动启动 doit" @update:model-value="toggleAutostart" />
      </div>
    </div>

    <div class="set-section">
      <h3>关于</h3>
      <div class="field" style="border: none">
        <label>版本</label>
        <div class="about-ver">
          <div class="about-ver-top">
            <span>doit-desktop v{{ currentVersion }} · 数据契约 v2</span>
            <button class="btn ghost" :disabled="checkingUpdate || downloading" @click="checkUpdate">
              {{ checkingUpdate ? '检查中…' : '检查更新' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="updateInfo || downloading || dlPath" class="field" style="border: none; padding-top: 0">
        <div class="update-box">
          <div v-if="updateInfo" class="update-tip">
            发现新版本 <b>v{{ updateInfo.latestTag }}</b>
            <span v-if="updateInfo.asset" class="update-hint">（{{ updateInfo.asset.name }}）</span>
          </div>

          <template v-if="downloading">
            <div class="update-bar"><div class="update-bar-fill" :style="{ width: dlPercent + '%' }" /></div>
            <div class="update-percent">
              {{ dlPercent }}%<span v-if="dlReceived">
                （{{ (dlReceived / 1048576).toFixed(1) }}MB / {{ dlTotal ? (dlTotal / 1048576).toFixed(1) : '?' }}MB）</span>
            </div>
          </template>
          <div v-else-if="dlPath" class="update-tip ok">已下载：{{ dlPath }}</div>

          <div v-if="updateInfo" class="update-row">
            <button v-if="updateInfo.asset" class="btn accent" :disabled="downloading" @click="runDownload">
              {{ downloading ? '下载中…' : (dlPath ? '重新下载' : '下载安装包') }}
            </button>
            <button class="btn ghost" @click="openReleases">打开 Releases 页</button>
          </div>
        </div>
      </div>
      <div class="field" style="border: none"><label>同步文件</label><span>doit-backup.json（与手机端共用）</span></div>
    </div>
  </div>
</template>
