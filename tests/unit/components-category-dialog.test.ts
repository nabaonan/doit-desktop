import { describe, expect, it } from 'vitest'
import { CATEGORY_SWATCHES } from '@/constants/tokens'
import { normalizeCategoryColor } from '@/domain/color'

/**
 * 分类弹框的 DOM 交互（保存读取实时 value、气泡展开/收起）由无头浏览器端到端验证——
 * reka-ui Dialog 的 Portal 在 jsdom 中不渲染，组件级 mount 无法覆盖。
 * 这里锁定可纯逻辑验证的色板契约：必须与手机端 doit-apk 的 PaletteColors 完全一致，
 * 否则同一个分类在两端会显示成不同颜色。
 */
describe('分类色板契约（与手机端一致）', () => {
  /** 手机端 doit-apk Color.kt 的 PaletteColors，顺序也需一致。 */
  const MOBILE_PALETTE = [
    '#34C7A8', '#5AA9E6', '#F2A65A', '#A78BFA',
    '#22B8CF', '#F08A8A', '#AACB5E', '#7C96B0',
  ]

  it('内置 8 色，逐项对齐手机端色板', () => {
    expect(CATEGORY_SWATCHES).toHaveLength(8)
    expect(CATEGORY_SWATCHES.map((s) => s.value)).toEqual(MOBILE_PALETTE)
    // 相邻色均不重复
    expect(new Set(CATEGORY_SWATCHES.map((s) => s.value)).size).toBe(8)
  })

  it('手机端设的色（带/不带 #）编辑时都能回显为色板中的选中项', () => {
    // 手机端新建/改色存带 # 的值 → 直接匹配；色板任一值都应能精确回显
    for (const swatch of CATEGORY_SWATCHES) {
      expect(normalizeCategoryColor(swatch.value)).toBe(swatch.value)
    }
    // 历史数据/旧同步值不带 # → 补 # 后也必须匹配到同一个色板项，否则色板无法高亮回显
    const paletteSet = new Set<string>(CATEGORY_SWATCHES.map((s) => s.value as string))
    for (const swatch of CATEGORY_SWATCHES) {
      const legacyValue: string = (swatch.value as string).slice(1) // 去掉 #，模拟手机端旧格式
      expect(paletteSet.has(normalizeCategoryColor(legacyValue))).toBe(true)
    }
  })
})
