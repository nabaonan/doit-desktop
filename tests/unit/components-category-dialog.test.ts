import { describe, expect, it } from 'vitest'
import { CATEGORY_SWATCHES } from '@/constants/tokens'

/**
 * 分类弹框的 DOM 交互（保存读取实时 value、气泡展开/收起）由无头浏览器端到端验证——
 * reka-ui Dialog 的 Portal 在 jsdom 中不渲染，组件级 mount 无法覆盖。
 * 这里锁定可纯逻辑验证的色板契约：必须与手机端 doit-apk 的 PaletteColors 完全一致，
 * 否则同一个分类在两端会显示成不同颜色。
 */
describe('分类色板契约（与手机端一致）', () => {
  /** 手机端 doit-apk Color.kt 的 PaletteColors，顺序也需一致。 */
  const MOBILE_PALETTE = [
    '#3FBB9C', '#5B9BD5', '#C9A24D', '#9186C9',
    '#2BB89A', '#E0857A', '#5A7F95', '#64B0C9',
  ]

  it('内置 8 色，逐项对齐手机端色板', () => {
    expect(CATEGORY_SWATCHES).toHaveLength(8)
    expect(CATEGORY_SWATCHES.map((s) => s.value)).toEqual(MOBILE_PALETTE)
    // 相邻色均不重复
    expect(new Set(CATEGORY_SWATCHES.map((s) => s.value)).size).toBe(8)
  })
})
