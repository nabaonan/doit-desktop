import type { AppSettings, Priority } from '@/domain/types'

export const PROG_COLORS = [
  { name: '薄荷绿', value: '#3FBB9C' },
  { name: '海蓝', value: '#4A90D9' },
  { name: '暖橙', value: '#F2A65A' },
  { name: '紫罗兰', value: '#9B6DD6' },
  { name: '玫红', value: '#E5688A' },
] as const

export const PRIORITY_META: Array<{ value: Priority; label: string; varName: string }> = [
  { value: 0, label: '低', varName: 'low' },
  { value: 1, label: '普通', varName: 'normal' },
  { value: 2, label: '高', varName: 'high' },
  { value: 3, label: '紧急', varName: 'urgent' },
]

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  skin: 'mint',
  progressColor: PROG_COLORS[0].value,
  webdav: {
    enabled: false,
    url: '',
    username: '',
    passwordRef: null,
    rootPath: null,
  },
}

/** 与 DESIGN_SPEC.md 2.6 一致；仅用于文档与 E2E 断言，样式断点仍写在 prototype.css。 */
export const BREAKPOINTS = [1020, 860, 820, 768, 420, 360] as const

export const DEFAULT_CATEGORY_COLORS = ['#3FBB9C', '#5B8DEF', '#F2A65A', '#C77DFF'] as const

/** 分类颜色选择器的内置色板，按感知亮度由浅到深排列（点击色块即选中，无需自由取色）。 */
export const CATEGORY_SWATCHES = [
  { name: '柠檬黄', value: '#E5B93B' },
  { name: '暖橙', value: '#F2A65A' },
  { name: '青蓝', value: '#38B9D6' },
  { name: '薄荷绿', value: '#3FBB9C' },
  { name: '紫罗兰', value: '#C77DFF' },
  { name: '玫红', value: '#E5688A' },
  { name: '珊瑚红', value: '#E86A5A' },
  { name: '海蓝', value: '#5B8DEF' },
] as const

/** Canvas 图表不能使用 CSS 变量，按主题提供与 tokens.css 同值的调色板。 */
export const CHART_PALETTES = {
  light: {
    heat: ['#EAF0ED', '#CDE9DF', '#9BD8C4', '#5FC2A4', '#2E9C7C'],
    mint: '#3FBB9C',
    mintDeep: '#1E7D66',
    mintSoft: '#E8F7F1',
    ink: '#16211F',
    ink2: '#5A6B66',
    ink3: '#93A39C',
    line: '#E6EDEA',
    card: '#FFFFFF',
  },
  dark: {
    heat: ['#1B2422', '#1F3A33', '#27584B', '#34866F', '#46C7A6'],
    mint: '#46C7A6',
    mintDeep: '#7FE3C8',
    mintSoft: '#16302A',
    ink: '#E8F1EE',
    ink2: '#9FB0AA',
    ink3: '#6B7B75',
    line: '#26322F',
    card: '#19221F',
  },
} as const

export const SETTINGS_STORAGE_KEY = 'doit-desktop-settings-v2'
export const SNAPSHOT_STORAGE_KEY = 'doit-desktop-snapshot-v2'
export const SYNC_BASE_STORAGE_KEY = 'doit-desktop-sync-base-v2'
