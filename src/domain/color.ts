/**
 * 分类颜色工具。
 *
 * 背景色刻意用 rgba() 而不是 CSS `color-mix(in srgb, ...)`：
 * color-mix 是较新的 CSS 语法，Tauri 在不同平台用的系统 WebView（macOS WKWebView /
 * Windows WebView2 / Linux WebKitGTK）版本参差，旧引擎解析失败会让整个 background 失效，
 * 表现为「分类数量标签没有背景色衬托、文字退回灰色」。rgba() 则所有引擎都支持。
 */

/** 兼容历史数据里 color 为空 / 非法的分类：统一回退薄荷绿，保证圆点与标签始终有可见颜色。 */
export const DEFAULT_CATEGORY_COLOR = '#3FBB9C'

/** 把任意分类色规范为合法的 #RRGGBB；空值 / 非法值回退默认色。 */
export function normalizeCategoryColor(color: string | undefined | null): string {
  const value = (color ?? '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_CATEGORY_COLOR
}

/** 分类色 + 透明度 → rgba() 字符串（如 #3FBB9C + 0.14 → rgba(63, 187, 156, 0.14)）。 */
export function categoryTint(color: string | undefined | null, alpha = 0.14): string {
  const hex = normalizeCategoryColor(color).slice(1)
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
