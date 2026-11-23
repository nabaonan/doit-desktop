import { describe, expect, it } from 'vitest'
import { categoryTint, DEFAULT_CATEGORY_COLOR, normalizeCategoryColor } from '@/domain/color'

describe('分类颜色工具', () => {
  it('normalizeCategoryColor 保留合法 hex，空值/非法值回退默认薄荷绿', () => {
    expect(normalizeCategoryColor('#E08A34')).toBe('#E08A34')
    expect(normalizeCategoryColor('  #3FBB9C  ')).toBe('#3FBB9C')
    expect(normalizeCategoryColor('')).toBe(DEFAULT_CATEGORY_COLOR)
    expect(normalizeCategoryColor('   ')).toBe(DEFAULT_CATEGORY_COLOR)
    expect(normalizeCategoryColor(undefined)).toBe(DEFAULT_CATEGORY_COLOR)
    expect(normalizeCategoryColor('#FFF')).toBe(DEFAULT_CATEGORY_COLOR)
    expect(normalizeCategoryColor('red')).toBe(DEFAULT_CATEGORY_COLOR)
  })

  it('categoryTint 输出 rgba() 而非 color-mix，兼容各版本 WebView', () => {
    // 14% = 参考图中分类数量标签的淡色背景浓度
    expect(categoryTint('#3FBB9C', 0.14)).toBe('rgba(63, 187, 156, 0.14)')
    expect(categoryTint('#E08A34', 0.14)).toBe('rgba(224, 138, 52, 0.14)')
    expect(categoryTint('#5B8DEF')).toBe('rgba(91, 141, 239, 0.14)')
    // 空色兜底后用默认色计算，不产生 rgba(NaN,...) / 空背景
    expect(categoryTint('', 0.14)).toBe('rgba(63, 187, 156, 0.14)')
  })
})
