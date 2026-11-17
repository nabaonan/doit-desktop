import { describe, expect, it } from 'vitest'
import { compareVersions, hasUpdate } from '@/services/update'

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
