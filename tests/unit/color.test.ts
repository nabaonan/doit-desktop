import { describe, expect, it } from 'vitest'
import { categoryTint, DEFAULT_CATEGORY_COLOR, normalizeCategoryColor } from '@/domain/color'

describe('分类颜色工具', () => {
  it('normalizeCategoryColor 保留合法 hex（统一大写），空值/非法值回退默认色', () => {
    expect(normalizeCategoryColor('#E08A34')).toBe('#E08A34')
    expect(normalizeCategoryColor('  #34c7a8  ')).toBe('#34C7A8')
    expect(normalizeCategoryColor('')).toBe(DEFAULT_CATEGORY_COLOR)
    expect(normalizeCategoryColor('   ')).toBe(DEFAULT_CATEGORY_COLOR)
    expect(normalizeCategoryColor(undefined)).toBe(DEFAULT_CATEGORY_COLOR)
    expect(normalizeCategoryColor('#FFF')).toBe(DEFAULT_CATEGORY_COLOR)
    expect(normalizeCategoryColor('red')).toBe(DEFAULT_CATEGORY_COLOR)
  })

  it('手机端历史值不带 # 时自动补 #，保证色板回显能匹配', () => {
    expect(normalizeCategoryColor('5B9BD5')).toBe('#5B9BD5')
    expect(normalizeCategoryColor('c9a24d')).toBe('#C9A24D')
    expect(normalizeCategoryColor(' 64b0c9 ')).toBe('#64B0C9')
  })

  it('categoryTint 输出 rgba() 而非 color-mix，兼容各版本 WebView', () => {
    // 14% = 参考图中分类数量标签的淡色背景浓度
    expect(categoryTint('#34C7A8', 0.14)).toBe('rgba(52, 199, 168, 0.14)')
    expect(categoryTint('#E08A34', 0.14)).toBe('rgba(224, 138, 52, 0.14)')
    expect(categoryTint('#5AA9E6')).toBe('rgba(90, 169, 230, 0.14)')
    // 不带 # 的历史值也能正确换算，不产生 rgba(NaN,...)
    expect(categoryTint('5B9BD5', 0.14)).toBe('rgba(91, 155, 213, 0.14)')
    // 空色兜底后用默认色计算，不产生 rgba(NaN,...) / 空背景
    expect(categoryTint('', 0.14)).toBe('rgba(52, 199, 168, 0.14)')
  })
})
