import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeCommand } from '@/services/ipc'
import { listen } from '@tauri-apps/api/event'
import { compareVersions, downloadUpdate, hasUpdate } from '@/services/update'

// downloadUpdate 依赖 Tauri IPC 与进度事件；这里直接模拟两者，验证返回值归一化。
vi.mock('@/services/ipc', () => ({ invokeCommand: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))

const DL_URL = 'https://github.com/nabaonan/doit-desktop/releases/download/v0.1.10/doit-desktop_0.1.10_aarch64.dmg'
const DL_PATH = '/Users/naban/Library/Caches/com.doit.desktop/update/doit-desktop_0.1.10_aarch64.dmg'

describe('downloadUpdate 返回值归一化', () => {
  beforeEach(() => {
    vi.mocked(listen).mockReset().mockResolvedValue(() => {})
    vi.mocked(invokeCommand).mockReset()
  })

  it('Rust 命令返回裸路径字符串时直接得到 string（不再访问 .path）', async () => {
    vi.mocked(invokeCommand).mockResolvedValue({ ok: true, value: DL_PATH })
    const result = await downloadUpdate(DL_URL, { onProgress: vi.fn(), onDone: vi.fn() })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(DL_PATH)
  })

  it('兼容 { path } 结构，仍归一化为 string', async () => {
    vi.mocked(invokeCommand).mockResolvedValue({ ok: true, value: { path: DL_PATH } })
    const result = await downloadUpdate(DL_URL, { onProgress: vi.fn(), onDone: vi.fn() })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(DL_PATH)
  })

  it('下载失败时保持 error，并上报一次 0 进度', async () => {
    const err = { code: 'E_NETWORK', message: '下载失败' }
    vi.mocked(invokeCommand).mockResolvedValue({ ok: false, error: err as never })
    const onProgress = vi.fn()
    const result = await downloadUpdate(DL_URL, { onProgress, onDone: vi.fn() })
    expect(result.ok).toBe(false)
    expect(onProgress).toHaveBeenCalledWith(0, 0)
  })
})

describe('update 版本比较', () => {
  it('相同版本相等', () => {
    expect(compareVersions('0.1.2', '0.1.2')).toBe(0)
    expect(compareVersions('v0.1.2', '0.1.2')).toBe(0)
  })

  it('新版本大于当前？compareVersions(current, latest) < 0 → 有更新', () => {
    expect(compareVersions('0.1.2', '0.1.2')).toBe(0)
    expect(compareVersions('0.1.1', '0.1.2')).toBeLessThan(0)
    expect(compareVersions('0.1.2', '0.1.1')).toBeGreaterThan(0)
    expect(compareVersions('0.9.9', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.2.0')).toBeGreaterThan(0)
    // 缺段按 0 补
    expect(compareVersions('0.1', '0.1.0')).toBe(0)
    expect(compareVersions('0.1.2', '0.1.2.1')).toBeLessThan(0)
  })

  it('hasUpdate 判断更直白', () => {
    expect(hasUpdate('0.1.1', 'v0.1.2')).toBe(true)
    expect(hasUpdate('0.1.2', 'v0.1.2')).toBe(false)
    expect(hasUpdate('0.10.0', 'v0.2.0')).toBe(false)
  })
})
