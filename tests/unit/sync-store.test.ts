import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSyncStore } from '@/stores/sync'
import { useSettingsStore } from '@/stores/settings'
import { useTaskStore } from '@/stores/tasks'

describe('sync 状态机：开关已开但从未验证时，不显示「已与远程同步」', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('未开启 → off', () => {
    const sync = useSyncStore()
    useSettingsStore().webdav.enabled = false
    expect(sync.kind).toBe('off')
  })

  it('已开启但从未测试/同步 → ready（已开启暂未同步）', () => {
    const sync = useSyncStore()
    useSettingsStore().webdav.enabled = true
    expect(sync.kind).toBe('ready')
  })

  it('测试连接成功后才 → synced', async () => {
    const sync = useSyncStore()
    useSettingsStore().webdav.enabled = true
    expect(sync.kind).toBe('ready')
    const msg = await sync.testConnection(
      { enabled: true, url: 'https://dav.example.com/doit/', username: 'alice', passwordRef: null, rootPath: null },
      'pw',
    )
    expect(msg).toContain('连接成功')
    expect(sync.kind).toBe('synced')
  })

  it('验证后数据变脏 → dirty；完成同步 markSynced → synced', async () => {
    const sync = useSyncStore()
    const settings = useSettingsStore()
    settings.webdav.enabled = true
    await sync.testConnection(
      { enabled: true, url: 'https://dav.example.com/doit/', username: 'alice', passwordRef: null, rootPath: null },
      'pw',
    )
    const tasks = useTaskStore()
    tasks.createTop('新任务', '工作')
    expect(tasks.dirty).toBe(true)
    expect(sync.kind).toBe('dirty')
    sync.markSynced()
    expect(sync.kind).toBe('synced')
  })
})
