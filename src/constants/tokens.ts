import type { AppSettings, Priority } from '@/domain/types'

export const PROG_COLORS = [
  { name: '薄荷绿', value: '#3FBB9C' },
  { name: '海蓝', value: '#4A90D9' },
  { name: '暖橙', value: '#F2A65A' },
  { name: '紫罗兰', value: '#9B6DD6' },
  { name: '玫红', value: '#E5688A' },
] as const

/**
 * 优先级元数据 —— 以手机端（doit-apk）为准：
 * 0 不设 / 1 低 / 2 普通 / 3 高 / 4 紧急。数组索引 == value（PRIORITY_META[v] 直取，顺序勿动）。
 * varName 对应 tokens.css 的 --prio-* 变量名。
 */
export const PRIORITY_META: Array<{ value: Priority; label: string; varName: string }> = [
  { value: 0, label: '不设', varName: 'none' },
  { value: 1, label: '低', varName: 'low' },
  { value: 2, label: '普通', varName: 'normal' },
  { value: 3, label: '高', varName: 'high' },
  { value: 4, label: '紧急', varName: 'urgent' },
]

/** 优先级选项的展示顺序：与手机端选择器一致——从高到低，最后是「不设」。 */
export const PRIORITY_OPTIONS: Array<{ value: Priority; label: string; varName: string }> = [
  ...PRIORITY_META.filter((m) => m.value !== 0).sort((a, b) => b.value - a.value),
  PRIORITY_META[0],
]

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  skin: 'mint',
  progressColor: PROG_COLORS[0].value,
  sortByPriority: false,
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

/**
 * 分类内置色板 —— 与手机端（doit-apk）Color.kt 的 PaletteColors 严格一致，两端必须同步修改，
 * 否则同一个分类会在两端显示成不同颜色。统一带 # 的 #RRGGBB，薄荷绿打头，整体清新。
 */
export const DEFAULT_CATEGORY_COLORS = [
  '#34C7A8', '#5AA9E6', '#F2A65A', '#A78BFA',
  '#22B8CF', '#F08A8A', '#AACB5E', '#7C96B0',
] as const

/** 分类颜色选择器的内置色板（同手机端 PaletteColors），点击色块即选中，无需自由取色。 */
export const CATEGORY_SWATCHES = [
  { name: '薄荷绿', value: '#34C7A8' },
  { name: '晴空蓝', value: '#5AA9E6' },
  { name: '暖阳橙', value: '#F2A65A' },
  { name: '薰衣草紫', value: '#A78BFA' },
  { name: '青碧色', value: '#22B8CF' },
  { name: '珊瑚粉', value: '#F08A8A' },
  { name: '嫩芽绿', value: '#AACB5E' },
  { name: '雾霭蓝', value: '#7C96B0' },
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
