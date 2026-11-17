import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'

const invokeMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/ipc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ipc')>()
  return { ...actual, invokeCommand: invokeMock }
})

import SettingsPanel from '@/components/doit/SettingsPanel.vue'
import { useSettingsStore } from '@/stores/settings'

const SECRET = 'super-secret-token-xyz'

function mountPanel(enabled = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  // 配置输入项仅在启用同步后展示，这里显式开启以覆盖凭据安全用例
  useSettingsStore().webdav.enabled = enabled
  const wrapper = mount(SettingsPanel, { global: { plugins: [pinia] } })
  return { wrapper, pinia }
}

describe('WebDAV 配置可见性', () => {
  it('未开启同步时隐藏服务器配置、凭据输入与操作按钮', () => {
    const { wrapper } = mountPanel(false)
    expect(wrapper.findAll('input.input')).toHaveLength(0)
    for (const label of ['服务器地址', '账号', '密码 / 令牌', '清除凭据', '测试连接', '保存并同步']) {
      expect(wrapper.text()).not.toContain(label)
    }
    expect(wrapper.find('button.btn.accent').exists()).toBe(false)
    // 开关本身仍然可见，用户可从这里开启
    expect(wrapper.text()).toContain('启用同步')
  })
})

describe('SettingsPanel 凭据安全', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue({ ok: true, value: undefined })
  })

  it('保存时明文密码只走独立 IPC 参数，绝不进入配置或设置 payload', async () => {
    const { wrapper } = mountPanel()
    const inputs = wrapper.findAll('input.input')
    await inputs[0].setValue('https://dav.example.com/doit/')
    await inputs[1].setValue('alice')
    await inputs[2].setValue(SECRET)

    const saveBtn = wrapper.get('button.btn.accent')
    expect(saveBtn.attributes('disabled')).toBeUndefined()
    await saveBtn.trigger('click')
    await flushPromises()

    const calls = invokeMock.mock.calls
    const setCall = calls.find((c) => c[0] === 'set_webdav_config')
    expect(setCall).toBeDefined()
    const payload = setCall![1] as Record<string, unknown>
    expect(payload.password).toBe(SECRET)
    expect(payload.config).not.toHaveProperty('password')
    expect(JSON.stringify(payload.config)).not.toContain(SECRET)

    const saveCall = calls.find((c) => c[0] === 'save_settings')
    expect(saveCall).toBeDefined()
    expect(JSON.stringify(saveCall![1])).not.toContain(SECRET)
    // passwordRef 只存引用，不含明文片段
    expect((payload.config as Record<string, unknown>).passwordRef).not.toContain(SECRET)
  })

  it('清除凭据后 passwordRef 置空且不残留明文', async () => {
    const { wrapper } = mountPanel()
    const inputs = wrapper.findAll('input.input')
    await inputs[0].setValue('https://dav.example.com/doit/')
    await inputs[1].setValue('alice')
    await inputs[2].setValue(SECRET)
    await wrapper.get('button.btn.accent').trigger('click')
    await flushPromises()

    await wrapper.findAll('button.btn.ghost')[0].trigger('click')
    await flushPromises()

    const settings = useSettingsStore()
    expect(settings.webdav.passwordRef).toBeNull()
    expect(settings.webdavPassword).toBe('')
    expect(JSON.stringify(settings.settings)).not.toContain(SECRET)
  })
})

describe('主题变量写入', () => {
  it('setTheme / setSkin / setProgressColor 同步写入 html 与 body 的 data 属性和 --done-anim', async () => {
    setActivePinia(createPinia())
    const settings = useSettingsStore()
    await settings.setTheme('dark')
    await settings.setSkin('soft')
    await settings.setProgressColor('#E5688A')
    for (const el of [document.documentElement, document.body]) {
      expect(el.getAttribute('data-theme')).toBe('dark')
      expect(el.getAttribute('data-skin')).toBe('soft')
      expect(el.style.getPropertyValue('--done-anim')).toBe('#E5688A')
    }
  })
})
