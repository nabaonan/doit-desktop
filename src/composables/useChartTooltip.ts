import { computed } from 'vue'
import { useUIStore } from '@/stores/ui'
import type { ChartTooltipState } from '@/domain/types'

/** 悬停预览 / 点击固定 / 外部点击·Esc·滚动·重渲染收起，共用一套状态。 */
export function useChartTooltip() {
  const ui = useUIStore()
  return {
    tooltip: computed(() => ui.tooltip),
    preview: (state: Omit<ChartTooltipState, 'pinned'>) => {
      if (!ui.tooltip?.pinned) ui.showTooltip({ ...state, pinned: false })
    },
    pin: (state: Omit<ChartTooltipState, 'pinned'>) => ui.showTooltip({ ...state, pinned: true }),
    dismiss: () => ui.hideTooltip(),
  }
}
