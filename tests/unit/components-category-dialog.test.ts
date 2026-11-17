import { describe, expect, it } from 'vitest'
import { CATEGORY_SWATCHES } from '@/constants/tokens'

/**
 * 分类弹框的 DOM 交互（保存读取实时 value、气泡展开/收起）由无头浏览器端到端验证——
 * reka-ui Dialog 的 Portal 在 jsdom 中不渲染，组件级 mount 无法覆盖。
 * 这里锁定可纯逻辑验证的色板契约：8 色且按感知亮度由浅到深排列。
 */
describe('分类色板契约', () => {
  it('内置 8 色，按由浅到深（感知亮度降序）排列', () => {
    expect(CATEGORY_SWATCHES).toHaveLength(8)
    expect(CATEGORY_SWATCHES[0].value).toBe('#E5B93B')   // 柠檬黄，最浅
    expect(CATEGORY_SWATCHES[7].value).toBe('#5B8DEF')   // 海蓝，最深
    // 相邻色均不重复
    expect(new Set(CATEGORY_SWATCHES.map((s) => s.value)).size).toBe(8)
  })

  it('感知亮度确实单调递减', () => {
    const lum = (hex: string) => {
      const h = hex.replace('#', '')
      const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
      return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
    }
    const values = CATEGORY_SWATCHES.map((s) => lum(s.value))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1])
    }
  })
})
