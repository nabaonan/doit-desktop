import { computed } from 'vue'
import { CHART_PALETTES } from '@/constants/tokens'
import { useSettingsStore } from '@/stores/settings'

/** ECharts 在 canvas 中绘制，拿不到 CSS 变量；这里按当前主题返回同值调色板。 */
export function useChartPalette() {
  const settings = useSettingsStore()
  return computed(() => CHART_PALETTES[settings.settings.theme])
}
