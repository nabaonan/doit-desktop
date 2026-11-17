import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dayKey, startOfMonth } from '@/domain/date'
import type { ChartTooltipState, PageId, StatsRange } from '@/domain/types'

export const useUIStore = defineStore('ui', () => {
  const page = ref<PageId>('today')
  const range = ref<StatsRange>('month')
  const calMonth = ref<Date>(startOfMonth(new Date()))
  const calSel = ref<string>(dayKey(new Date()))
  const tooltip = ref<ChartTooltipState | null>(null)
  const toast = ref<string | null>(null)
  const confirmDeleteFor = ref<string | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function navigate(p: PageId): void {
    page.value = p
  }

  function setRange(r: StatsRange): void {
    range.value = r
    tooltip.value = null
  }

  function notify(msg: string): void {
    toast.value = msg
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = null }, 2200)
  }

  function showTooltip(state: ChartTooltipState): void {
    tooltip.value = state
  }

  function hideTooltip(): void {
    tooltip.value = null
  }

  function askDelete(uid: string): void {
    confirmDeleteFor.value = uid
  }

  function closeDelete(): void {
    confirmDeleteFor.value = null
  }

  return {
    page, range, calMonth, calSel, tooltip, toast, confirmDeleteFor,
    navigate, setRange, notify, showTooltip, hideTooltip, askDelete, closeDelete,
  }
})
